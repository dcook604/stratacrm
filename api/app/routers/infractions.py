"""
Infraction lifecycle router — s.135 Strata Property Act compliance.

Lifecycle:
  open → notice_sent → response_received → [hearing_scheduled] → fined | dismissed
                                          └──────────────────────────────────────┘

Every status-advancing action appends an InfractionEvent (append-only audit trail).
The notice endpoint generates a WeasyPrint PDF, saves it, and optionally emails it.
"""

import os
from datetime import datetime, date, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.audit import log_action
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, require_csrf, require_write
from app.email import send_email
from app.models import (
    Bylaw,
    CommunicationChannel,
    CommunicationsLog,
    ContactMethod,
    ContactMethodType,
    DeliveryMethod,
    Document,
    FineSchedule,
    Infraction,
    InfractionEvent,
    InfractionEventType,
    InfractionStatus,
    Lot,
    Notice,
    Party,
    StrataCorporation,
    User,
    UserRole,
)
from app.notices.generator import render_notice_pdf
from app.schemas.infractions import (
    BylawMini,
    FineScheduleMini,
    InfractionCreate,
    InfractionDetail,
    InfractionEventCreate,
    InfractionEventOut,
    InfractionListItem,
    InfractionUpdate,
    LotMini,
    NoticeCreate,
    NoticeOut,
    PartyMini,
)

router = APIRouter(prefix="/infractions", tags=["infractions"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_infraction(infraction_id: int, db: Session) -> Infraction:
    inf = db.execute(
        select(Infraction)
        .where(Infraction.id == infraction_id)
        .options(
            selectinload(Infraction.lot),
            selectinload(Infraction.primary_party),
            selectinload(Infraction.bylaw).selectinload(Bylaw.fine_schedules),
            selectinload(Infraction.events),
            selectinload(Infraction.notices).selectinload(Notice.document),
        )
    ).scalar_one_or_none()
    if not inf:
        raise HTTPException(status_code=404, detail="Infraction not found")
    return inf


def _find_applicable_fine(bylaw: Bylaw, occurrence_number: int) -> Optional[FineSchedule]:
    """Return the fine schedule row matching occurrence_number (3+ maps to 99)."""
    target = occurrence_number if occurrence_number <= 2 else 99
    for fs in bylaw.fine_schedules:
        if fs.occurrence_number == target:
            return fs
    return None


def _calc_occurrence_number(db: Session, lot_id: int, bylaw_id: int) -> int:
    """Count prior non-dismissed infractions for same lot+bylaw to set occurrence number."""
    count = db.execute(
        select(func.count())
        .select_from(Infraction)
        .where(Infraction.lot_id == lot_id)
        .where(Infraction.bylaw_id == bylaw_id)
        .where(Infraction.status != InfractionStatus.dismissed)
    ).scalar() or 0
    return min(count + 1, 99)


def _build_detail(inf: Infraction, current_user: User) -> InfractionDetail:
    applicable_fine = _find_applicable_fine(inf.bylaw, inf.occurrence_number)

    notices = []
    for n in inf.notices:
        pdf_url = f"/api/infractions/{inf.id}/notices/{n.id}/pdf" if n.document_id else None
        notices.append(NoticeOut(
            id=n.id,
            infraction_id=n.infraction_id,
            document_id=n.document_id,
            delivery_method=n.delivery_method,
            delivered_at=n.delivered_at,
            created_at=n.created_at,
            pdf_url=pdf_url,
        ))

    return InfractionDetail(
        id=inf.id,
        lot=LotMini.model_validate(inf.lot),
        primary_party=PartyMini.model_validate(inf.primary_party),
        bylaw=BylawMini.model_validate(inf.bylaw),
        applicable_fine=FineScheduleMini.model_validate(applicable_fine) if applicable_fine else None,
        status=inf.status,
        complaint_received_date=inf.complaint_received_date,
        description=inf.description,
        assessed_fine_amount=inf.assessed_fine_amount,
        occurrence_number=inf.occurrence_number,
        events=[InfractionEventOut.model_validate(e) for e in inf.events],
        notices=notices,
        created_at=inf.created_at,
        updated_at=inf.updated_at,
    )


# ---------------------------------------------------------------------------
# Status transition rules (s.135 compliance)
# ---------------------------------------------------------------------------

# event_type → allowed current statuses + resulting status (None = no status change)
_TRANSITIONS: dict[InfractionEventType, tuple[set[InfractionStatus], Optional[InfractionStatus]]] = {
    InfractionEventType.notice_sent: (
        {InfractionStatus.open},
        InfractionStatus.notice_sent,
    ),
    InfractionEventType.response_received: (
        {InfractionStatus.notice_sent},
        InfractionStatus.response_received,
    ),
    InfractionEventType.hearing_held: (
        {InfractionStatus.notice_sent, InfractionStatus.response_received,
         InfractionStatus.hearing_scheduled},
        InfractionStatus.hearing_scheduled,
    ),
    InfractionEventType.decision_made: (
        {InfractionStatus.notice_sent, InfractionStatus.response_received,
         InfractionStatus.hearing_scheduled},
        None,  # fine_levied or dismissed follows
    ),
    InfractionEventType.fine_levied: (
        {InfractionStatus.notice_sent, InfractionStatus.response_received,
         InfractionStatus.hearing_scheduled},
        InfractionStatus.fined,
    ),
    InfractionEventType.payment_received: (
        {InfractionStatus.fined},
        None,  # stays fined
    ),
    InfractionEventType.dismissed: (
        {InfractionStatus.open, InfractionStatus.notice_sent,
         InfractionStatus.response_received, InfractionStatus.hearing_scheduled},
        InfractionStatus.dismissed,
    ),
}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=list[InfractionListItem])
def list_infractions(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    status_filter: Optional[InfractionStatus] = Query(None, alias="status"),
    lot_id: Optional[int] = Query(None),
    bylaw_id: Optional[int] = Query(None),
    open_only: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    stmt = (
        select(Infraction)
        .options(
            selectinload(Infraction.lot),
            selectinload(Infraction.primary_party),
            selectinload(Infraction.bylaw),
        )
    )
    if status_filter:
        stmt = stmt.where(Infraction.status == status_filter)
    if open_only:
        stmt = stmt.where(
            Infraction.status.in_([
                InfractionStatus.open, InfractionStatus.notice_sent,
                InfractionStatus.response_received, InfractionStatus.hearing_scheduled,
            ])
        )
    if lot_id:
        stmt = stmt.where(Infraction.lot_id == lot_id)
    if bylaw_id:
        stmt = stmt.where(Infraction.bylaw_id == bylaw_id)

    stmt = stmt.order_by(Infraction.complaint_received_date.desc()).offset(skip).limit(limit)
    infractions = db.execute(stmt).scalars().all()

    return [
        InfractionListItem(
            id=i.id,
            lot=LotMini.model_validate(i.lot),
            primary_party=PartyMini.model_validate(i.primary_party),
            bylaw=BylawMini.model_validate(i.bylaw),
            status=i.status,
            complaint_received_date=i.complaint_received_date,
            assessed_fine_amount=i.assessed_fine_amount,
            occurrence_number=i.occurrence_number,
            created_at=i.created_at,
        )
        for i in infractions
    ]


@router.post("", response_model=InfractionDetail, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_csrf)])
def create_infraction(
    request: Request,
    body: InfractionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    lot = db.get(Lot, body.lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    party = db.get(Party, body.primary_party_id)
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")

    bylaw = db.get(Bylaw, body.bylaw_id)
    if not bylaw:
        raise HTTPException(status_code=404, detail="Bylaw not found")

    occurrence_number = _calc_occurrence_number(db, body.lot_id, body.bylaw_id)

    inf = Infraction(
        lot_id=body.lot_id,
        primary_party_id=body.primary_party_id,
        bylaw_id=body.bylaw_id,
        complaint_received_date=body.complaint_received_date,
        complaint_source=body.complaint_source,
        description=body.description,
        status=InfractionStatus.open,
        occurrence_number=occurrence_number,
    )
    db.add(inf)
    db.flush()

    # Auto-record complaint_received event (s.135 trail starts here)
    event = InfractionEvent(
        infraction_id=inf.id,
        event_type=InfractionEventType.complaint_received,
        occurred_at=datetime.now(timezone.utc),
        actor_id=current_user.id,
        actor_email=current_user.email,
        notes=f"Complaint received for {body.complaint_received_date.strftime('%B %d, %Y')}.",
    )
    db.add(event)

    log_action(db, action="create", entity_type="infraction", entity_id=inf.id,
               changes={"lot_id": body.lot_id, "bylaw_id": body.bylaw_id, "occurrence_number": occurrence_number},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()

    return _build_detail(_load_infraction(inf.id, db), current_user)


@router.get("/{infraction_id}", response_model=InfractionDetail)
def get_infraction(
    infraction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _build_detail(_load_infraction(infraction_id, db), current_user)


@router.patch("/{infraction_id}", response_model=InfractionDetail,
              dependencies=[Depends(require_csrf)])
def update_infraction(
    infraction_id: int,
    request: Request,
    body: InfractionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    inf = db.get(Infraction, infraction_id)
    if not inf:
        raise HTTPException(status_code=404, detail="Infraction not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(inf, field, value)

    log_action(db, action="update", entity_type="infraction", entity_id=infraction_id,
               changes=body.model_dump(exclude_unset=True, mode="json"),
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    return _build_detail(_load_infraction(infraction_id, db), current_user)


@router.post("/{infraction_id}/events", response_model=InfractionEventOut,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
def add_event(
    infraction_id: int,
    request: Request,
    body: InfractionEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    """Add a lifecycle event with s.135 transition validation."""
    inf = db.get(Infraction, infraction_id)
    if not inf:
        raise HTTPException(status_code=404, detail="Infraction not found")

    # complaint_received is only auto-logged at creation
    if body.event_type == InfractionEventType.complaint_received:
        raise HTTPException(
            status_code=400,
            detail="complaint_received is recorded automatically at infraction creation."
        )

    # Validate transition
    if body.event_type in _TRANSITIONS:
        allowed_statuses, new_status = _TRANSITIONS[body.event_type]
        if inf.status not in allowed_statuses:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Cannot record '{body.event_type.value}' when infraction is in "
                    f"'{inf.status.value}' status. Allowed from: "
                    f"{', '.join(s.value for s in allowed_statuses)}."
                ),
            )
        if new_status is not None:
            inf.status = new_status

    occurred_at = body.occurred_at or datetime.now(timezone.utc)

    # For fine_levied, auto-look up fine amount if not already set
    notes = body.notes
    if body.event_type == InfractionEventType.fine_levied and inf.assessed_fine_amount is None:
        bylaw = db.execute(
            select(Bylaw).where(Bylaw.id == inf.bylaw_id)
            .options(selectinload(Bylaw.fine_schedules))
        ).scalar_one_or_none()
        if bylaw:
            fs = _find_applicable_fine(bylaw, inf.occurrence_number)
            if fs:
                inf.assessed_fine_amount = fs.fine_amount
                notes = (notes or "") + f" Fine of ${fs.fine_amount} per schedule."

    event = InfractionEvent(
        infraction_id=infraction_id,
        event_type=body.event_type,
        occurred_at=occurred_at,
        actor_id=current_user.id,
        actor_email=current_user.email,
        notes=notes,
    )
    db.add(event)

    log_action(db, action="create", entity_type="infraction_event", entity_id=infraction_id,
               changes={"event_type": body.event_type.value, "new_status": inf.status.value},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    db.refresh(event)
    return InfractionEventOut.model_validate(event)


@router.post("/{infraction_id}/notices", response_model=NoticeOut,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
def generate_notice(
    infraction_id: int,
    request: Request,
    body: NoticeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    """
    Generate a s.135 notice PDF, save it, and optionally email it.
    Also advances infraction status to notice_sent and records the event.
    """
    inf = _load_infraction(infraction_id, db)

    if inf.status != InfractionStatus.open:
        raise HTTPException(
            status_code=422,
            detail=f"Notice can only be generated from 'open' status (current: {inf.status.value})."
        )

    # Load strata corp for letterhead
    corp = db.execute(select(StrataCorporation).limit(1)).scalar_one_or_none()
    if not corp:
        raise HTTPException(status_code=500, detail="Strata corporation not configured.")

    # Party address
    party = inf.primary_party
    address_lines = [
        party.mailing_address_line1,
        party.mailing_address_line2,
        " ".join(filter(None, [
            party.mailing_city,
            party.mailing_province,
            party.mailing_postal_code,
        ])) or None,
        party.mailing_country if party.mailing_country != "Canada" else None,
    ]

    # Fine schedules for notice
    fine_schedules = [
        {
            "occurrence_number": fs.occurrence_number,
            "fine_amount": fs.fine_amount,
            "continuing_contravention_amount": fs.continuing_contravention_amount,
            "max_per_week": fs.max_per_week,
        }
        for fs in inf.bylaw.fine_schedules
    ]

    corp_address = ", ".join(filter(None, [corp.address, corp.city, corp.province, corp.postal_code]))

    pdf_bytes = render_notice_pdf(
        infraction_id=infraction_id,
        corp_name=corp.name,
        strata_plan=corp.strata_plan,
        corp_address=corp_address,
        party_name=party.full_name,
        party_address_lines=address_lines,
        strata_lot_number=inf.lot.strata_lot_number,
        unit_number=inf.lot.unit_number,
        bylaw_number=inf.bylaw.bylaw_number,
        bylaw_section=inf.bylaw.section,
        bylaw_title=inf.bylaw.title,
        bylaw_full_text=inf.bylaw.full_text,
        complaint_date=inf.complaint_received_date,
        description=inf.description,
        fine_schedules=fine_schedules,
    )

    # Save PDF to disk
    uploads_dir = settings.uploads_dir
    os.makedirs(uploads_dir, exist_ok=True)
    filename = f"notice_inf{infraction_id}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.pdf"
    storage_path = os.path.join(uploads_dir, filename)
    with open(storage_path, "wb") as f:
        f.write(pdf_bytes)

    # Create Document record
    doc = Document(
        storage_path=storage_path,
        original_filename=filename,
        mime_type="application/pdf",
        file_size_bytes=len(pdf_bytes),
        uploaded_by_id=current_user.id,
        linked_entity_type="infraction",
        linked_entity_id=infraction_id,
    )
    db.add(doc)
    db.flush()

    # Create Notice record
    notice = Notice(
        infraction_id=infraction_id,
        document_id=doc.id,
        delivery_method=body.delivery_method,
        delivered_at=datetime.now(timezone.utc) if body.delivery_method == DeliveryMethod.email else None,
    )
    db.add(notice)
    db.flush()

    # Advance infraction status → notice_sent
    inf_db = db.get(Infraction, infraction_id)
    inf_db.status = InfractionStatus.notice_sent

    # Record event
    event = InfractionEvent(
        infraction_id=infraction_id,
        event_type=InfractionEventType.notice_sent,
        occurred_at=datetime.now(timezone.utc),
        actor_id=current_user.id,
        actor_email=current_user.email,
        notes=f"Notice generated. Delivery: {body.delivery_method.value}.",
        document_id=doc.id,
    )
    db.add(event)

    # Send email if requested
    email_sent = False
    if body.delivery_method == DeliveryMethod.email and body.send_email:
        primary_email = db.execute(
            select(ContactMethod)
            .where(ContactMethod.party_id == party.id)
            .where(ContactMethod.method_type == ContactMethodType.email)
            .where(ContactMethod.is_primary.is_(True))
        ).scalar_one_or_none()

        if not primary_email:
            # Fall back to any email
            primary_email = db.execute(
                select(ContactMethod)
                .where(ContactMethod.party_id == party.id)
                .where(ContactMethod.method_type == ContactMethodType.email)
            ).scalar_one_or_none()

        if primary_email:
            subject = (
                f"Notice of Bylaw Contravention — "
                f"SL{inf.lot.strata_lot_number}, Strata Plan {corp.strata_plan}"
            )
            body_text = (
                f"Dear {party.full_name},\n\n"
                f"Please find attached a Notice of Bylaw Contravention issued by "
                f"the Strata Council of {corp.name}.\n\n"
                f"Bylaw: {inf.bylaw.bylaw_number} — {inf.bylaw.title}\n"
                f"Strata Lot: SL{inf.lot.strata_lot_number}"
                + (f", Unit {inf.lot.unit_number}" if inf.lot.unit_number else "")
                + "\n\n"
                f"You have 14 days from the date of this notice to respond in writing.\n\n"
                f"Yours truly,\n{corp.name}\n"
            )
            email_sent = send_email(
                to_address=primary_email.value,
                subject=subject,
                body_text=body_text,
                attachment_bytes=pdf_bytes,
                attachment_filename=filename,
            )

            # Log to communications_log
            comm = CommunicationsLog(
                channel=CommunicationChannel.transactional,
                recipient_party_id=party.id,
                subject=subject,
                body_preview=body_text[:500],
                status="sent" if email_sent else "failed",
            )
            db.add(comm)

    log_action(db, action="create", entity_type="notice", entity_id=notice.id,
               changes={"infraction_id": infraction_id, "delivery_method": body.delivery_method.value,
                        "email_sent": email_sent},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    db.refresh(notice)

    return NoticeOut(
        id=notice.id,
        infraction_id=notice.infraction_id,
        document_id=notice.document_id,
        delivery_method=notice.delivery_method,
        delivered_at=notice.delivered_at,
        created_at=notice.created_at,
        pdf_url=f"/api/infractions/{infraction_id}/notices/{notice.id}/pdf",
    )


@router.get("/{infraction_id}/notices/{notice_id}/pdf")
def download_notice_pdf(
    infraction_id: int,
    notice_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Stream the notice PDF for download."""
    notice = db.execute(
        select(Notice)
        .where(Notice.id == notice_id)
        .where(Notice.infraction_id == infraction_id)
        .options(selectinload(Notice.document))
    ).scalar_one_or_none()

    if not notice or not notice.document:
        raise HTTPException(status_code=404, detail="Notice PDF not found")

    storage_path = notice.document.storage_path
    if not os.path.exists(storage_path):
        raise HTTPException(status_code=404, detail="PDF file not found on disk")

    with open(storage_path, "rb") as f:
        pdf_bytes = f.read()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{notice.document.original_filename}"'
        },
    )
