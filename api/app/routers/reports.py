"""Reports router — lot summary reports with PDF export."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import String, func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Incident,
    IncidentStatus,
    Infraction,
    InfractionStatus,
    Issue,
    IssueStatus,
    Lot,
    LotAssignment,
    Party,
    StrataCorporation,
    User,
)
from app.reports.generator import render_lot_report_pdf
from app.schemas.reports import (
    LotReportDetail,
    LotReportParty,
    LotReportSummary,
    PaginatedLotReports,
    ReportIncident,
    ReportInfraction,
    ReportIssue,
)

router = APIRouter(prefix="/reports", tags=["reports"])

_OPEN_INFRACTION_STATUSES = [
    InfractionStatus.open,
    InfractionStatus.notice_sent,
    InfractionStatus.response_received,
    InfractionStatus.hearing_scheduled,
]
_OPEN_INCIDENT_STATUSES = [IncidentStatus.open, IncidentStatus.in_progress]
_OPEN_ISSUE_STATUSES = [IssueStatus.open, IssueStatus.in_progress]


def _load_lot_or_404(lot_id: int, db: Session) -> Lot:
    lot = db.get(Lot, lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    return lot


@router.get("/lot-summary", response_model=PaginatedLotReports)
def lot_summary(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    search: Optional[str] = Query(None, description="Filter by unit number or SL#"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
):
    """Aggregated summary of all lots with infraction/incident/issue counts."""

    base = select(Lot)

    if search:
        like = f"%{search}%"
        base = base.where(
            Lot.unit_number.ilike(like)
            | Lot.strata_lot_number.cast(String).ilike(like)
        )

    count_q = select(func.count()).select_from(base.subquery())
    total = db.execute(count_q).scalar() or 0

    lots = db.execute(
        base.order_by(Lot.strata_lot_number).offset(skip).limit(limit)
    ).scalars().all()

    lot_ids = [l.id for l in lots]
    if not lot_ids:
        return PaginatedLotReports(items=[], total=0, skip=skip, limit=limit)

    # Bulk fetch assignments (current owners/tenants)
    assignments = db.execute(
        select(LotAssignment)
        .where(LotAssignment.lot_id.in_(lot_ids))
        .where(LotAssignment.is_current.is_(True))
        .options(selectinload(LotAssignment.party))
    ).scalars().all()

    assignments_by_lot: dict[int, list[LotAssignment]] = {}
    for a in assignments:
        assignments_by_lot.setdefault(a.lot_id, []).append(a)

    # Bulk fetch counts
    inf_total_rows = db.execute(
        select(Infraction.lot_id, func.count().label("c"))
        .where(Infraction.lot_id.in_(lot_ids))
        .group_by(Infraction.lot_id)
    ).all()
    inf_open_rows = db.execute(
        select(Infraction.lot_id, func.count().label("c"))
        .where(Infraction.lot_id.in_(lot_ids))
        .where(Infraction.status.in_(_OPEN_INFRACTION_STATUSES))
        .group_by(Infraction.lot_id)
    ).all()

    inf_total: dict[int, int] = {r.lot_id: r.c for r in inf_total_rows}
    inf_open: dict[int, int] = {r.lot_id: r.c for r in inf_open_rows}

    inc_total_rows = db.execute(
        select(Incident.lot_id, func.count().label("c"))
        .where(Incident.lot_id.in_(lot_ids))
        .group_by(Incident.lot_id)
    ).all()
    inc_open_rows = db.execute(
        select(Incident.lot_id, func.count().label("c"))
        .where(Incident.lot_id.in_(lot_ids))
        .where(Incident.status.in_(_OPEN_INCIDENT_STATUSES))
        .group_by(Incident.lot_id)
    ).all()

    inc_total: dict[int, int] = {r.lot_id: r.c for r in inc_total_rows}
    inc_open: dict[int, int] = {r.lot_id: r.c for r in inc_open_rows}

    iss_total_rows = db.execute(
        select(Issue.related_lot_id, func.count().label("c"))
        .where(Issue.related_lot_id.in_(lot_ids))
        .group_by(Issue.related_lot_id)
    ).all()
    iss_open_rows = db.execute(
        select(Issue.related_lot_id, func.count().label("c"))
        .where(Issue.related_lot_id.in_(lot_ids))
        .where(Issue.status.in_(_OPEN_ISSUE_STATUSES))
        .group_by(Issue.related_lot_id)
    ).all()

    iss_total: dict[int, int] = {r.related_lot_id: r.c for r in iss_total_rows}
    iss_open: dict[int, int] = {r.related_lot_id: r.c for r in iss_open_rows}

    # Latest activity per lot — max of updated_at across all three entities
    items: list[LotReportSummary] = []
    for lot in lots:
        lot_assignments = assignments_by_lot.get(lot.id, [])
        owners = sorted(
            {a.party.full_name for a in lot_assignments if a.party
             and a.role in ("owner_occupant", "owner_absentee")}
        )
        tenants = sorted(
            {a.party.full_name for a in lot_assignments if a.party
             and a.role == "tenant"}
        )

        items.append(LotReportSummary(
            id=lot.id,
            strata_lot_number=lot.strata_lot_number,
            unit_number=lot.unit_number,
            square_feet=lot.square_feet,
            owners=list(owners),
            tenants=list(tenants),
            open_infractions=inf_open.get(lot.id, 0),
            total_infractions=inf_total.get(lot.id, 0),
            open_incidents=inc_open.get(lot.id, 0),
            total_incidents=inc_total.get(lot.id, 0),
            open_issues=iss_open.get(lot.id, 0),
            total_issues=iss_total.get(lot.id, 0),
        ))

    return PaginatedLotReports(items=items, total=total, skip=skip, limit=limit)


@router.get("/lot-summary/{lot_id}", response_model=LotReportDetail)
def lot_summary_detail(
    lot_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Detailed report for a single lot with all infractions, incidents, and issues."""
    lot = _load_lot_or_404(lot_id, db)

    # Current parties
    assignments = db.execute(
        select(LotAssignment)
        .where(LotAssignment.lot_id == lot_id)
        .where(LotAssignment.is_current.is_(True))
        .options(selectinload(LotAssignment.party))
    ).scalars().all()

    parties = [
        LotReportParty(id=a.party.id, full_name=a.party.full_name, role=a.role.value)
        for a in assignments if a.party
    ]

    # Counts
    total_infractions = db.execute(
        select(func.count()).select_from(Infraction).where(Infraction.lot_id == lot_id)
    ).scalar() or 0
    open_infractions = db.execute(
        select(func.count()).select_from(Infraction)
        .where(Infraction.lot_id == lot_id)
        .where(Infraction.status.in_(_OPEN_INFRACTION_STATUSES))
    ).scalar() or 0

    total_incidents = db.execute(
        select(func.count()).select_from(Incident).where(Incident.lot_id == lot_id)
    ).scalar() or 0
    open_incidents = db.execute(
        select(func.count()).select_from(Incident)
        .where(Incident.lot_id == lot_id)
        .where(Incident.status.in_(_OPEN_INCIDENT_STATUSES))
    ).scalar() or 0

    total_issues = db.execute(
        select(func.count()).select_from(Issue).where(Issue.related_lot_id == lot_id)
    ).scalar() or 0
    open_issues = db.execute(
        select(func.count()).select_from(Issue)
        .where(Issue.related_lot_id == lot_id)
        .where(Issue.status.in_(_OPEN_ISSUE_STATUSES))
    ).scalar() or 0

    # Infractions
    infractions_raw = db.execute(
        select(Infraction)
        .where(Infraction.lot_id == lot_id)
        .options(selectinload(Infraction.primary_party), selectinload(Infraction.bylaw))
        .order_by(Infraction.complaint_received_date.desc())
    ).scalars().all()

    infractions = [
        ReportInfraction(
            id=i.id,
            status=i.status.value,
            bylaw_number=i.bylaw.bylaw_number if i.bylaw else "",
            bylaw_title=i.bylaw.title if i.bylaw else "",
            complaint_received_date=i.complaint_received_date,
            assessed_fine_amount=i.assessed_fine_amount,
            occurrence_number=i.occurrence_number,
            party_name=i.primary_party.full_name if i.primary_party else None,
            created_at=i.created_at,
        )
        for i in infractions_raw
    ]

    # Incidents
    incidents_raw = db.execute(
        select(Incident)
        .where(Incident.lot_id == lot_id)
        .order_by(Incident.incident_date.desc())
    ).scalars().all()

    incidents = [
        ReportIncident(
            id=i.id,
            category=i.category,
            incident_date=i.incident_date,
            status=i.status.value,
            description=i.description,
            reported_by=i.reported_by,
            created_at=i.created_at,
        )
        for i in incidents_raw
    ]

    # Issues
    issues_raw = db.execute(
        select(Issue)
        .where(Issue.related_lot_id == lot_id)
        .options(selectinload(Issue.assignee))
        .order_by(Issue.created_at.desc())
    ).scalars().all()

    issues = [
        ReportIssue(
            id=i.id,
            title=i.title,
            status=i.status.value,
            priority=i.priority.value,
            due_date=i.due_date,
            assignee_name=i.assignee.full_name if i.assignee else None,
            created_at=i.created_at,
        )
        for i in issues_raw
    ]

    return LotReportDetail(
        id=lot.id,
        strata_lot_number=lot.strata_lot_number,
        unit_number=lot.unit_number,
        square_feet=lot.square_feet,
        parking_stalls=lot.parking_stalls,
        storage_lockers=lot.storage_lockers,
        notes=lot.notes,
        parties=parties,
        open_infractions=open_infractions,
        total_infractions=total_infractions,
        open_incidents=open_incidents,
        total_incidents=total_incidents,
        open_issues=open_issues,
        total_issues=total_issues,
        infractions=infractions,
        incidents=incidents,
        issues=issues,
    )


@router.get("/lot-summary/{lot_id}/pdf")
def lot_summary_pdf(
    lot_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Generate and stream a PDF report for a single lot."""
    lot = _load_lot_or_404(lot_id, db)

    corp = db.execute(select(StrataCorporation).limit(1)).scalar_one_or_none()
    if not corp:
        raise HTTPException(status_code=500, detail="Strata corporation not configured.")

    corp_address = ", ".join(filter(None, [
        corp.address, corp.city, corp.province, corp.postal_code
    ]))

    # Current parties
    assignments = db.execute(
        select(LotAssignment)
        .where(LotAssignment.lot_id == lot_id)
        .where(LotAssignment.is_current.is_(True))
        .options(selectinload(LotAssignment.party))
    ).scalars().all()

    parties = [
        {"full_name": a.party.full_name, "role": a.role.value}
        for a in assignments if a.party
    ]

    # Counts
    total_infractions = db.execute(
        select(func.count()).select_from(Infraction).where(Infraction.lot_id == lot_id)
    ).scalar() or 0
    open_infractions = db.execute(
        select(func.count()).select_from(Infraction)
        .where(Infraction.lot_id == lot_id)
        .where(Infraction.status.in_(_OPEN_INFRACTION_STATUSES))
    ).scalar() or 0

    total_incidents = db.execute(
        select(func.count()).select_from(Incident).where(Incident.lot_id == lot_id)
    ).scalar() or 0
    open_incidents = db.execute(
        select(func.count()).select_from(Incident)
        .where(Incident.lot_id == lot_id)
        .where(Incident.status.in_(_OPEN_INCIDENT_STATUSES))
    ).scalar() or 0

    total_issues = db.execute(
        select(func.count()).select_from(Issue).where(Issue.related_lot_id == lot_id)
    ).scalar() or 0
    open_issues = db.execute(
        select(func.count()).select_from(Issue)
        .where(Issue.related_lot_id == lot_id)
        .where(Issue.status.in_(_OPEN_ISSUE_STATUSES))
    ).scalar() or 0

    # Infractions
    infractions_raw = db.execute(
        select(Infraction)
        .where(Infraction.lot_id == lot_id)
        .options(selectinload(Infraction.primary_party), selectinload(Infraction.bylaw))
        .order_by(Infraction.complaint_received_date.desc())
    ).scalars().all()

    infractions = [
        {
            "party_name": i.primary_party.full_name if i.primary_party else None,
            "bylaw_number": i.bylaw.bylaw_number if i.bylaw else "",
            "complaint_received_date": i.complaint_received_date,
            "assessed_fine_amount": i.assessed_fine_amount,
            "status": i.status.value,
        }
        for i in infractions_raw
    ]

    # Incidents
    incidents_raw = db.execute(
        select(Incident).where(Incident.lot_id == lot_id)
        .order_by(Incident.incident_date.desc())
    ).scalars().all()

    incidents = [
        {
            "category": i.category,
            "incident_date": i.incident_date,
            "description": i.description,
            "status": i.status.value,
        }
        for i in incidents_raw
    ]

    # Issues
    issues_raw = db.execute(
        select(Issue).where(Issue.related_lot_id == lot_id)
        .options(selectinload(Issue.assignee))
        .order_by(Issue.created_at.desc())
    ).scalars().all()

    issues = [
        {
            "title": i.title,
            "priority": i.priority.value,
            "due_date": i.due_date,
            "assignee_name": i.assignee.full_name if i.assignee else None,
            "status": i.status.value,
        }
        for i in issues_raw
    ]

    pdf_bytes = render_lot_report_pdf(
        corp_name=corp.name,
        strata_plan=corp.strata_plan,
        corp_address=corp_address,
        strata_lot_number=lot.strata_lot_number,
        unit_number=lot.unit_number,
        square_feet=lot.square_feet,
        parking_stalls=lot.parking_stalls,
        storage_lockers=lot.storage_lockers,
        parties=parties,
        open_infractions=open_infractions,
        total_infractions=total_infractions,
        open_incidents=open_incidents,
        total_incidents=total_incidents,
        open_issues=open_issues,
        total_issues=total_issues,
        infractions=infractions,
        incidents=incidents,
        issues=issues,
    )

    filename = f"lot_report_SL{lot.strata_lot_number}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )
