"""Payment notification email body generators."""
from datetime import date
from decimal import Decimal
from typing import Optional


def advance_notice_email(
    renter_name: str,
    unit_info: str,
    description: str,
    amount: Decimal,
    due_date: date,
    days_until_due: int,
    strata_name: str = "Spectrum 4 Strata Council",
) -> tuple[str, str]:
    """Return (subject, body_text) for an advance payment notice."""
    subject = f"Upcoming Payment Due — {description}, {unit_info}"
    body = (
        f"Dear {renter_name},\n\n"
        f"This is a reminder that your payment for {description} "
        f"({unit_info}) is due in {days_until_due} days.\n\n"
        f"Amount Due: ${amount:,.2f}\n"
        f"Due Date: {due_date.strftime('%B %d, %Y')}\n\n"
        f"Please arrange payment before the due date to avoid any late fees.\n\n"
        f"Payment can be made by:\n"
        f"  - E-Transfer to the strata's registered email address\n"
        f"  - Cheque delivered to the strata council mailbox\n"
        f"  - Direct deposit (contact council for details)\n\n"
        f"If you have already submitted payment, please disregard this notice.\n\n"
        f"Yours truly,\n{strata_name}"
    )
    return subject, body


def reminder_email(
    renter_name: str,
    unit_info: str,
    description: str,
    amount: Decimal,
    due_date: date,
    days_until_due: int,
    strata_name: str = "Spectrum 4 Strata Council",
) -> tuple[str, str]:
    """Return (subject, body_text) for a payment reminder."""
    subject = f"Reminder: {description} Due Soon — {unit_info}"
    body = (
        f"Dear {renter_name},\n\n"
        f"This is a follow-up reminder that your payment for {description} "
        f"({unit_info}) is due in {days_until_due} days.\n\n"
        f"Amount Due: ${amount:,.2f}\n"
        f"Due Date: {due_date.strftime('%B %d, %Y')}\n\n"
        f"Please ensure payment is submitted promptly.\n\n"
        f"Yours truly,\n{strata_name}"
    )
    return subject, body


def overdue_notice_email(
    renter_name: str,
    unit_info: str,
    description: str,
    amount: Decimal,
    due_date: date,
    days_overdue: int,
    late_fee: Optional[Decimal] = None,
    strata_name: str = "Spectrum 4 Strata Council",
) -> tuple[str, str]:
    """Return (subject, body_text) for an overdue payment notice."""
    total = amount + (late_fee or Decimal("0"))
    subject = f"OVERDUE: {description} — {unit_info}"

    lines = [
        f"Dear {renter_name},\n",
        f"Our records indicate that your payment for {description} "
        f"({unit_info}) is now {days_overdue} days overdue.\n",
        f"Original Amount Due: ${amount:,.2f}\n",
        f"Due Date: {due_date.strftime('%B %d, %Y')}\n",
    ]
    if late_fee:
        lines.append(f"Late Fee: ${late_fee:,.2f}\n")
        lines.append(f"Total Outstanding: ${total:,.2f}\n")
    lines.extend([
        "\nPlease submit payment immediately to avoid further escalation, "
        "which may include referral to the strata's legal counsel.\n",
        f"\nYours truly,\n{strata_name}",
    ])

    return subject, "".join(lines)
