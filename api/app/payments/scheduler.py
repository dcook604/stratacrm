"""
Payment billing & notification scheduler tasks.

Called by APScheduler on intervals — not a standalone CLI.
"""
import structlog
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, or_, and_
from sqlalchemy.orm import Session, selectinload

from app.models import (
    ContactMethod, ContactMethodType, Payment, PaymentConfig,
    PaymentNotification, PaymentNotificationType,
    PaymentSchedule, PaymentStatus,
)
from app.payments.notifications import (
    advance_notice_email,
    reminder_email,
    overdue_notice_email,
)
from app.email import send_email
from app.config import settings

log = structlog.get_logger()


def run_billing_sweep(db: Session) -> None:
    """Generate pending payment records for active schedules that need them.
    Runs once daily. Creates payment rows for the current billing cycle if
    one doesn't already exist.
    """
    config = db.get(PaymentConfig, 1)
    if not config:
        log.warning("payment_config_not_found_skipping_billing_sweep")
        return

    today = date.today()
    schedules = db.execute(
        select(PaymentSchedule)
        .where(PaymentSchedule.is_active.is_(True))
        .where(
            or_(
                PaymentSchedule.end_date.is_(None),
                PaymentSchedule.end_date >= today,
            )
        )
        .options(selectinload(PaymentSchedule.payments))
    ).scalars().all()

    created = 0
    for sched in schedules:
        if sched.start_date > today:
            continue

        # Determine next due date based on frequency
        next_due = _compute_next_due_date(sched, today)
        if next_due is None:
            continue

        # Check if a payment record already exists for this due date
        already_exists = any(
            p.due_date == next_due and p.status != PaymentStatus.cancelled
            for p in sched.payments
        )
        if already_exists:
            continue

        payment = Payment(
            payment_schedule_id=sched.id,
            lot_id=sched.lot_id,
            party_id=sched.party_id,
            amount_due=sched.amount,
            due_date=next_due,
            status=PaymentStatus.pending,
        )
        db.add(payment)
        created += 1

    if created:
        db.commit()
        log.info("billing_sweep_complete", payments_created=created)
    else:
        log.debug("billing_sweep_no_new_payments")


def _compute_next_due_date(sched: PaymentSchedule, from_date: date) -> Optional[date]:
    """Compute the next due date after from_date for a schedule.
    Returns None if the schedule has ended.
    """
    if sched.end_date and from_date > sched.end_date:
        return None

    # Build candidate date in current/later month
    year, month = from_date.year, from_date.month
    candidate = _safe_date(year, month, sched.billing_day)

    if candidate < sched.start_date:
        candidate = sched.start_date
    if sched.end_date and candidate > sched.end_date:
        return None

    # If candidate is still in the past, advance by one period
    if candidate < from_date:
        if sched.frequency.value == "monthly":
            month += 1
            if month > 12:
                month = 1
                year += 1
        elif sched.frequency.value == "quarterly":
            month += 3
            if month > 12:
                month -= 12
                year += 1
        elif sched.frequency.value == "yearly":
            year += 1
        candidate = _safe_date(year, month, sched.billing_day)

    if sched.end_date and candidate > sched.end_date:
        return None
    return candidate


def _safe_date(year: int, month: int, day: int) -> date:
    """Create a date, clamping day to month length (e.g. Jan 31 → Jan 31, Feb 31 → Feb 28)."""
    import calendar
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, max_day))


def run_notification_sweep(db: Session) -> None:
    """Check pending/overdue payments and send notifications as configured.
    Runs every 5 minutes.
    """
    config = db.get(PaymentConfig, 1)
    if not config:
        log.warning("payment_config_not_found_skipping_notification_sweep")
        return

    today = date.today()
    sent = 0

    # 1. Pending payments — advance notices and reminders
    pending_payments = db.execute(
        select(Payment)
        .where(Payment.status == PaymentStatus.pending)
        .options(
            selectinload(Payment.payment_schedule),
            selectinload(Payment.party).selectinload("contact_methods"),
            selectinload(Payment.lot),
        )
    ).scalars().all()

    for pymt in pending_payments:
        days_until_due = (pymt.due_date - today).days
        if days_until_due < 0:
            # Mark overdue (grace period considered below)
            continue

        # Advance notice at exactly advance_notice_days
        if days_until_due == config.advance_notice_days:
            _send_notification(db, pymt, PaymentNotificationType.advance_notice, config)
            sent += 1

        # Additional reminders at each configured interval
        if days_until_due in config.additional_reminder_days:
            # Only send if not already sent for this type+day combo
            if not _already_notified_today(db, pymt.id, PaymentNotificationType.reminder, days_until_due):
                _send_notification(db, pymt, PaymentNotificationType.reminder, config)
                sent += 1

    # 2. Overdue payments (including pending that are past due past grace period)
    cutoff = today - timedelta(days=config.grace_period_days)
    overdue_payments = db.execute(
        select(Payment)
        .where(
            Payment.status.in_([PaymentStatus.pending, PaymentStatus.overdue]),
            Payment.due_date < cutoff,
        )
        .options(
            selectinload(Payment.payment_schedule),
            selectinload(Payment.party).selectinload("contact_methods"),
            selectinload(Payment.lot),
        )
    ).scalars().all()

    for pymt in overdue_payments:
        # Mark as overdue if still pending
        if pymt.status == PaymentStatus.pending:
            pymt.status = PaymentStatus.overdue

        days_overdue = (today - pymt.due_date).days
        if days_overdue in config.past_due_notice_days:
            if not _already_notified_today(db, pymt.id, PaymentNotificationType.overdue_notice, days_overdue):
                _send_overdue_notification(db, pymt, days_overdue, config)
                sent += 1

    if sent:
        db.commit()
        log.info("notification_sweep_complete", notifications_sent=sent)
    else:
        log.debug("notification_sweep_no_notifications_sent")


def _already_notified_today(
    db: Session,
    payment_id: int,
    ntype: PaymentNotificationType,
    days_offset: int,
) -> bool:
    """Check if a notification of this type was already sent for this payment today."""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    existing = db.execute(
        select(PaymentNotification)
        .where(PaymentNotification.payment_id == payment_id)
        .where(PaymentNotification.notification_type == ntype)
        .where(PaymentNotification.sent_at >= today_start)
    ).scalar_one_or_none()
    return existing is not None


def _send_notification(
    db: Session,
    pymt: Payment,
    ntype: PaymentNotificationType,
    config: PaymentConfig,
) -> None:
    """Send a payment notification to the party's primary email."""
    party = pymt.party
    email = _find_primary_email(party.contact_methods)
    if not email:
        log.warning("no_email_for_party", party_id=party.id, payment_id=pymt.id)
        return

    today = date.today()
    days = (pymt.due_date - today).days
    unit_info = f"SL{pymt.lot.strata_lot_number}" + (f", Unit {pymt.lot.unit_number}" if pymt.lot.unit_number else "")

    if ntype == PaymentNotificationType.advance_notice:
        subject, body = advance_notice_email(
            party.full_name, unit_info, pymt.payment_schedule.description,
            pymt.amount_due, pymt.due_date, days,
        )
    else:
        subject, body = reminder_email(
            party.full_name, unit_info, pymt.payment_schedule.description,
            pymt.amount_due, pymt.due_date, days,
        )

    success = send_email(to_address=email, subject=subject, body_text=body)

    notif = PaymentNotification(
        payment_id=pymt.id,
        notification_type=ntype,
        recipient_email=email,
        status="sent" if success else "failed",
    )
    db.add(notif)


def _send_overdue_notification(
    db: Session,
    pymt: Payment,
    days_overdue: int,
    config: PaymentConfig,
) -> None:
    """Send an overdue payment notification."""
    party = pymt.party
    email = _find_primary_email(party.contact_methods)
    if not email:
        log.warning("no_email_for_party", party_id=party.id, payment_id=pymt.id)
        return

    unit_info = f"SL{pymt.lot.strata_lot_number}" + (f", Unit {pymt.lot.unit_number}" if pymt.lot.unit_number else "")

    subject, body = overdue_notice_email(
        party.full_name, unit_info, pymt.payment_schedule.description,
        pymt.amount_due, pymt.due_date, days_overdue,
        late_fee=config.late_fee_amount,
    )

    success = send_email(to_address=email, subject=subject, body_text=body)

    notif = PaymentNotification(
        payment_id=pymt.id,
        notification_type=PaymentNotificationType.overdue_notice,
        recipient_email=email,
        status="sent" if success else "failed",
    )
    db.add(notif)


def _find_primary_email(contact_methods: list) -> Optional[str]:
    """Find the primary email contact for a party."""
    # Prefer primary email
    for cm in contact_methods:
        if cm.method_type == ContactMethodType.email and cm.is_primary:
            return cm.value
    # Fallback to any email
    for cm in contact_methods:
        if cm.method_type == ContactMethodType.email:
            return cm.value
    return None
