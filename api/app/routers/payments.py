"""
Payment tracking router — locker rentals and strata-owned lot payments.

Endpoints:
  /payments/config          — global notification config
  /payments/schedules       — payment schedule CRUD
  /payments                 — payment record list, create, update
  /payments/{id}/record     — record a payment (mark paid)
  /payments/{id}/notify     — manually trigger notification
"""
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload

from app.audit import log_action
from app.database import get_db
from app.dependencies import get_current_user, require_csrf, require_write
from app.models import (
    Payment,
    PaymentConfig,
    PaymentNotification,
    PaymentNotificationType,
    PaymentSchedule,
    PaymentStatus,
    Party,
    Lot,
    User,
    ContactMethod,
    ContactMethodType,
)
from app.payments.notifications import (
    advance_notice_email,
    reminder_email,
    overdue_notice_email,
)
from app.email import send_email
from app.schemas.payments import (
    PaymentConfigOut,
    PaymentConfigUpdate,
    PaymentCreate,
    PaymentListItem,
    PaymentOut,
    PaymentNotificationOut,
    PaymentRecordPayment,
    PaymentScheduleCreate,
    PaymentScheduleListItem,
    PaymentScheduleOut,
    PaymentScheduleUpdate,
    PaymentUpdate,
    LotMini,
    PartyMini,
)
from app.config import settings

router = APIRouter(prefix="/payments", tags=["payments"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _config_to_out(cfg: PaymentConfig) -> PaymentConfigOut:
    return PaymentConfigOut(
        advance_notice_days=cfg.advance_notice_days,
        additional_reminder_days=list(cfg.additional_reminder_days or []),
        past_due_notice_days=list(cfg.past_due_notice_days or []),
        late_fee_amount=cfg.late_fee_amount,
        grace_period_days=cfg.grace_period_days,
    )


def _load_schedule(schedule_id: int, db: Session) -> PaymentSchedule:
    sched = db.execute(
        select(PaymentSchedule)
        .where(PaymentSchedule.id == schedule_id)
        .options(
            selectinload(PaymentSchedule.lot),
            selectinload(PaymentSchedule.party),
            selectinload(PaymentSchedule.payments).selectinload(Payment.notifications),
        )
    ).scalar_one_or_none()
    if not sched:
        raise HTTPException(status_code=404, detail="Payment schedule not found")
    return sched


def _payment_to_out(pymt: Payment) -> PaymentOut:
    return PaymentOut(
        id=pymt.id,
        payment_schedule_id=pymt.payment_schedule_id,
        lot=LotMini.model_validate(pymt.lot),
        party=PartyMini.model_validate(pymt.party),
        amount_due=pymt.amount_due,
        amount_paid=pymt.amount_paid,
        due_date=pymt.due_date,
        paid_date=pymt.paid_date,
        status=pymt.status,
        payment_method=pymt.payment_method,
        reference_number=pymt.reference_number,
        notes=pymt.notes,
        notifications=[PaymentNotificationOut.model_validate(n) for n in (pymt.notifications or [])],
        created_at=pymt.created_at,
        updated_at=pymt.updated_at,
    )


def _payment_to_list_item(pymt: Payment) -> PaymentListItem:
    return PaymentListItem(
        id=pymt.id,
        lot=LotMini.model_validate(pymt.lot),
        party=PartyMini.model_validate(pymt.party),
        amount_due=pymt.amount_due,
        amount_paid=pymt.amount_paid,
        due_date=pymt.due_date,
        paid_date=pymt.paid_date,
        status=pymt.status,
        payment_method=pymt.payment_method,
    )


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

@router.get("/config", response_model=PaymentConfigOut)
def get_payment_config(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    cfg = db.get(PaymentConfig, 1)
    if not cfg:
        raise HTTPException(status_code=404, detail="Payment config not found")
    return _config_to_out(cfg)


@router.put("/config", response_model=PaymentConfigOut,
            dependencies=[Depends(require_csrf)])
def update_payment_config(
    body: PaymentConfigUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    cfg = db.get(PaymentConfig, 1)
    if not cfg:
        raise HTTPException(status_code=404, detail="Payment config not found")

    changes = {}
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cfg, field, value)
        changes[field] = str(value) if isinstance(value, list) else value

    log_action(db, action="update", entity_type="payment_config", entity_id=1,
               changes=changes, actor_id=current_user.id,
               actor_email=current_user.email, request=request)
    db.commit()
    db.refresh(cfg)
    return _config_to_out(cfg)


# ---------------------------------------------------------------------------
# Payment Schedules
# ---------------------------------------------------------------------------

@router.get("/schedules", response_model=list[PaymentScheduleListItem])
def list_schedules(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    lot_id: Optional[int] = Query(None),
    party_id: Optional[int] = Query(None),
    active_only: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    stmt = select(PaymentSchedule).options(
        selectinload(PaymentSchedule.lot),
        selectinload(PaymentSchedule.party),
        selectinload(PaymentSchedule.payments),
    )
    if lot_id:
        stmt = stmt.where(PaymentSchedule.lot_id == lot_id)
    if party_id:
        stmt = stmt.where(PaymentSchedule.party_id == party_id)
    if active_only:
        stmt = stmt.where(PaymentSchedule.is_active.is_(True))

    stmt = stmt.order_by(PaymentSchedule.created_at.desc()).offset(skip).limit(limit)
    schedules = db.execute(stmt).scalars().all()

    today = date.today()
    result = []
    for s in schedules:
        # Find next pending/overdue payment
        next_due = None
        balance = Decimal("0")
        for p in s.payments:
            if p.status in (PaymentStatus.pending, PaymentStatus.overdue):
                if next_due is None or p.due_date < next_due:
                    next_due = p.due_date
                balance += p.amount_due - p.amount_paid

        result.append(PaymentScheduleListItem(
            id=s.id,
            lot=LotMini.model_validate(s.lot),
            party=PartyMini.model_validate(s.party),
            description=s.description,
            amount=s.amount,
            frequency=s.frequency,
            billing_day=s.billing_day,
            is_active=s.is_active,
            next_due_date=next_due,
            outstanding_balance=balance,
        ))
    return result


@router.post("/schedules", response_model=PaymentScheduleOut,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
def create_schedule(
    body: PaymentScheduleCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    lot = db.get(Lot, body.lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    party = db.get(Party, body.party_id)
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")

    sched = PaymentSchedule(
        lot_id=body.lot_id,
        party_id=body.party_id,
        description=body.description,
        amount=body.amount,
        frequency=body.frequency,
        billing_day=body.billing_day,
        start_date=body.start_date,
        end_date=body.end_date,
    )
    db.add(sched)
    db.flush()

    # Create the first payment record if start_date is in the past or today
    if body.start_date <= date.today():
        from app.payments.scheduler import _compute_next_due_date
        next_due = _compute_next_due_date(sched, date.today())
        if next_due:
            pymt = Payment(
                payment_schedule_id=sched.id,
                lot_id=sched.lot_id,
                party_id=sched.party_id,
                amount_due=sched.amount,
                due_date=next_due,
                status=PaymentStatus.pending,
            )
            db.add(pymt)

    log_action(db, action="create", entity_type="payment_schedule", entity_id=sched.id,
               changes={"lot_id": body.lot_id, "party_id": body.party_id, "amount": str(body.amount)},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()

    return _schedule_to_out(_load_schedule(sched.id, db))


@router.get("/schedules/{schedule_id}", response_model=PaymentScheduleOut)
def get_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    sched = _load_schedule(schedule_id, db)
    return _schedule_to_out(sched)


@router.put("/schedules/{schedule_id}", response_model=PaymentScheduleOut,
            dependencies=[Depends(require_csrf)])
def update_schedule(
    schedule_id: int,
    body: PaymentScheduleUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    sched = _load_schedule(schedule_id, db)
    changes = {}
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(sched, field, value)
        changes[field] = str(value) if isinstance(value, Decimal) else value

    log_action(db, action="update", entity_type="payment_schedule", entity_id=schedule_id,
               changes=changes, actor_id=current_user.id,
               actor_email=current_user.email, request=request)
    db.commit()
    return _schedule_to_out(_load_schedule(schedule_id, db))


@router.delete("/schedules/{schedule_id}",
               status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_csrf)])
def deactivate_schedule(
    schedule_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    sched = _load_schedule(schedule_id, db)
    sched.is_active = False

    log_action(db, action="update", entity_type="payment_schedule", entity_id=schedule_id,
               changes={"is_active": False},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()


def _schedule_to_out(sched: PaymentSchedule) -> PaymentScheduleOut:
    return PaymentScheduleOut(
        id=sched.id,
        lot=LotMini.model_validate(sched.lot),
        party=PartyMini.model_validate(sched.party),
        description=sched.description,
        amount=sched.amount,
        frequency=sched.frequency,
        billing_day=sched.billing_day,
        start_date=sched.start_date,
        end_date=sched.end_date,
        is_active=sched.is_active,
        payments=[PaymentMini(p) for p in sched.payments],
        created_at=sched.created_at,
        updated_at=sched.updated_at,
    )


def PaymentMini(p: Payment) -> dict:
    return {
        "id": p.id,
        "amount_due": p.amount_due,
        "amount_paid": p.amount_paid,
        "due_date": p.due_date,
        "paid_date": p.paid_date,
        "status": p.status,
    }


# ---------------------------------------------------------------------------
# Payment Records
# ---------------------------------------------------------------------------

@router.get("", response_model=list[PaymentListItem])
def list_payments(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    status_filter: Optional[PaymentStatus] = Query(None, alias="status"),
    lot_id: Optional[int] = Query(None),
    party_id: Optional[int] = Query(None),
    schedule_id: Optional[int] = Query(None),
    overdue_only: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    stmt = select(Payment).options(
        selectinload(Payment.lot),
        selectinload(Payment.party),
    )
    if status_filter:
        stmt = stmt.where(Payment.status == status_filter)
    if lot_id:
        stmt = stmt.where(Payment.lot_id == lot_id)
    if party_id:
        stmt = stmt.where(Payment.party_id == party_id)
    if schedule_id:
        stmt = stmt.where(Payment.payment_schedule_id == schedule_id)
    if overdue_only:
        from datetime import date as dt_date
        stmt = stmt.where(
            Payment.status.in_([PaymentStatus.pending, PaymentStatus.overdue]),
            Payment.due_date < dt_date.today(),
        )

    stmt = stmt.order_by(Payment.due_date.desc()).offset(skip).limit(limit)
    payments = db.execute(stmt).scalars().all()
    return [_payment_to_list_item(p) for p in payments]


@router.post("", response_model=PaymentOut,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
def create_payment(
    body: PaymentCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    """Manually create a payment record (e.g. one-off or catch-up)."""
    # Validate foreign keys
    if not db.get(PaymentSchedule, body.payment_schedule_id):
        raise HTTPException(status_code=404, detail="Payment schedule not found")
    if not db.get(Lot, body.lot_id):
        raise HTTPException(status_code=404, detail="Lot not found")
    if not db.get(Party, body.party_id):
        raise HTTPException(status_code=404, detail="Party not found")

    pymt = Payment(**body.model_dump())
    db.add(pymt)
    db.flush()

    log_action(db, action="create", entity_type="payment", entity_id=pymt.id,
               changes={"payment_schedule_id": body.payment_schedule_id,
                        "amount_due": str(body.amount_due), "due_date": str(body.due_date)},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    db.refresh(pymt)
    return _payment_detail(pymt.id, db)


@router.get("/{payment_id}", response_model=PaymentOut)
def get_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    pymt = _load_payment(payment_id, db)
    return _payment_to_out(pymt)


@router.patch("/{payment_id}", response_model=PaymentOut,
              dependencies=[Depends(require_csrf)])
def update_payment(
    payment_id: int,
    body: PaymentUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    pymt = _load_payment(payment_id, db)
    changes = {}
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(pymt, field, value)
        changes[field] = str(value) if isinstance(value, Decimal) else value

    log_action(db, action="update", entity_type="payment", entity_id=payment_id,
               changes=changes, actor_id=current_user.id,
               actor_email=current_user.email, request=request)
    db.commit()
    return _payment_detail(payment_id, db)


@router.post("/{payment_id}/record", response_model=PaymentOut,
             dependencies=[Depends(require_csrf)])
def record_payment(
    payment_id: int,
    body: PaymentRecordPayment,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    """Record a payment received against a payment record."""
    pymt = _load_payment(payment_id, db)

    if pymt.status == PaymentStatus.cancelled:
        raise HTTPException(status_code=400, detail="Cannot record payment on a cancelled record")
    if pymt.status == PaymentStatus.paid:
        raise HTTPException(status_code=400, detail="Payment record is already fully paid")

    pymt.amount_paid = body.amount_paid
    pymt.paid_date = body.paid_date
    pymt.payment_method = body.payment_method
    pymt.reference_number = body.reference_number
    if body.notes:
        pymt.notes = (pymt.notes or "") + "\n" + body.notes if pymt.notes else body.notes

    # Determine status
    if body.amount_paid >= pymt.amount_due:
        pymt.status = PaymentStatus.paid
    elif body.amount_paid > 0:
        pymt.status = PaymentStatus.partially_paid

    log_action(db, action="update", entity_type="payment", entity_id=payment_id,
               changes={"amount_paid": str(body.amount_paid), "status": pymt.status.value},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    return _payment_detail(payment_id, db)


@router.post("/{payment_id}/notify",
             status_code=status.HTTP_200_OK, dependencies=[Depends(require_csrf)])
def send_payment_notification(
    payment_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    """Manually trigger a payment notification."""
    pymt = _load_payment(payment_id, db)
    config = db.get(PaymentConfig, 1)

    from datetime import date as dt_date
    today = dt_date.today()
    days_until_due = (pymt.due_date - today).days

    # Find party email
    party = pymt.party
    email = None
    for cm in (party.contact_methods or []):
        if cm.method_type == ContactMethodType.email and cm.is_primary:
            email = cm.value
            break
    if not email:
        for cm in (party.contact_methods or []):
            if cm.method_type == ContactMethodType.email:
                email = cm.value
                break
    if not email:
        raise HTTPException(status_code=400, detail="No email found for party")

    unit_info = f"SL{pymt.lot.strata_lot_number}" + (f", Unit {pymt.lot.unit_number}" if pymt.lot.unit_number else "")

    if days_until_due > 0:
        if days_until_due <= (config.advance_notice_days if config else 45):
            subject, body = advance_notice_email(
                party.full_name, unit_info, pymt.payment_schedule.description,
                pymt.amount_due, pymt.due_date, days_until_due,
            )
        else:
            subject, body = reminder_email(
                party.full_name, unit_info, pymt.payment_schedule.description,
                pymt.amount_due, pymt.due_date, days_until_due,
            )
        ntype = PaymentNotificationType.advance_notice
    else:
        days_overdue = abs(days_until_due)
        subject, body = overdue_notice_email(
            party.full_name, unit_info, pymt.payment_schedule.description,
            pymt.amount_due, pymt.due_date, days_overdue,
            late_fee=config.late_fee_amount if config else None,
        )
        ntype = PaymentNotificationType.overdue_notice

    success = send_email(to_address=email, subject=subject, body_text=body)

    notif = PaymentNotification(
        payment_id=payment_id,
        notification_type=ntype,
        recipient_email=email,
        status="sent" if success else "failed",
    )
    db.add(notif)

    log_action(db, action="create", entity_type="payment_notification", entity_id=payment_id,
               changes={"notification_type": ntype.value, "status": notif.status},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()

    return {"sent": success, "notification_type": ntype.value, "recipient_email": email}


def _load_payment(payment_id: int, db: Session) -> Payment:
    pymt = db.execute(
        select(Payment)
        .where(Payment.id == payment_id)
        .options(
            selectinload(Payment.lot),
            selectinload(Payment.party).selectinload("contact_methods"),
            selectinload(Payment.payment_schedule),
            selectinload(Payment.notifications),
        )
    ).scalar_one_or_none()
    if not pymt:
        raise HTTPException(status_code=404, detail="Payment not found")
    return pymt


def _payment_detail(payment_id: int, db: Session) -> PaymentOut:
    return _payment_to_out(_load_payment(payment_id, db))
