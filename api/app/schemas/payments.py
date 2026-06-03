"""Pydantic schemas for payment tracking."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models import PaymentFrequency, PaymentMethod, PaymentNotificationType, PaymentStatus


# ---------------------------------------------------------------------------
# Payment Config
# ---------------------------------------------------------------------------

class PaymentConfigOut(BaseModel):
    advance_notice_days: int = 45
    additional_reminder_days: list[int] = [30, 14, 7]
    past_due_notice_days: list[int] = [1, 7, 14, 30]
    late_fee_amount: Optional[Decimal] = None
    grace_period_days: int = 0

    model_config = {"from_attributes": True}


class PaymentConfigUpdate(BaseModel):
    advance_notice_days: Optional[int] = Field(None, ge=1, le=365)
    additional_reminder_days: Optional[list[int]] = None
    past_due_notice_days: Optional[list[int]] = None
    late_fee_amount: Optional[Decimal] = None
    grace_period_days: Optional[int] = Field(None, ge=0, le=365)


# ---------------------------------------------------------------------------
# Payment Schedules
# ---------------------------------------------------------------------------

class PaymentScheduleCreate(BaseModel):
    lot_id: int
    party_id: int
    description: str = Field(max_length=500)
    amount: Decimal = Field(ge=0)
    frequency: PaymentFrequency = PaymentFrequency.monthly
    billing_day: int = Field(default=1, ge=1, le=31)
    start_date: date
    end_date: Optional[date] = None


class PaymentScheduleUpdate(BaseModel):
    description: Optional[str] = Field(None, max_length=500)
    amount: Optional[Decimal] = Field(None, ge=0)
    frequency: Optional[PaymentFrequency] = None
    billing_day: Optional[int] = Field(None, ge=1, le=31)
    end_date: Optional[date] = None
    is_active: Optional[bool] = None


class PaymentMini(BaseModel):
    id: int
    amount_due: Decimal
    amount_paid: Decimal
    due_date: date
    paid_date: Optional[date] = None
    status: PaymentStatus

    model_config = {"from_attributes": True}


class LotMini(BaseModel):
    id: int
    strata_lot_number: int
    unit_number: Optional[str] = None

    model_config = {"from_attributes": True}


class PartyMini(BaseModel):
    id: int
    full_name: str
    party_type: str

    model_config = {"from_attributes": True}


class PaymentScheduleOut(BaseModel):
    id: int
    lot: LotMini
    party: PartyMini
    description: str
    amount: Decimal
    frequency: PaymentFrequency
    billing_day: int
    start_date: date
    end_date: Optional[date] = None
    is_active: bool
    payments: list[PaymentMini] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaymentScheduleListItem(BaseModel):
    id: int
    lot: LotMini
    party: PartyMini
    description: str
    amount: Decimal
    frequency: PaymentFrequency
    billing_day: int
    is_active: bool
    next_due_date: Optional[date] = None
    outstanding_balance: Decimal = Decimal("0")

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Payment Records
# ---------------------------------------------------------------------------

class PaymentCreate(BaseModel):
    payment_schedule_id: int
    lot_id: int
    party_id: int
    amount_due: Decimal = Field(ge=0)
    amount_paid: Decimal = Field(default=0, ge=0)
    due_date: date
    paid_date: Optional[date] = None
    status: PaymentStatus = PaymentStatus.pending
    payment_method: Optional[PaymentMethod] = None
    reference_number: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class PaymentUpdate(BaseModel):
    amount_paid: Optional[Decimal] = Field(None, ge=0)
    paid_date: Optional[date] = None
    status: Optional[PaymentStatus] = None
    payment_method: Optional[PaymentMethod] = None
    reference_number: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class PaymentRecordPayment(BaseModel):
    """Record a payment against an existing payment record."""
    amount_paid: Decimal = Field(ge=0)
    paid_date: date
    payment_method: Optional[PaymentMethod] = None
    reference_number: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class PaymentNotificationOut(BaseModel):
    id: int
    notification_type: PaymentNotificationType
    recipient_email: str
    sent_at: datetime
    status: str

    model_config = {"from_attributes": True}


class PaymentOut(BaseModel):
    id: int
    payment_schedule_id: int
    lot: LotMini
    party: PartyMini
    amount_due: Decimal
    amount_paid: Decimal
    due_date: date
    paid_date: Optional[date] = None
    status: PaymentStatus
    payment_method: Optional[PaymentMethod] = None
    reference_number: Optional[str] = None
    notes: Optional[str] = None
    notifications: list[PaymentNotificationOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaymentListItem(BaseModel):
    id: int
    lot: LotMini
    party: PartyMini
    amount_due: Decimal
    amount_paid: Decimal
    due_date: date
    paid_date: Optional[date] = None
    status: PaymentStatus
    payment_method: Optional[PaymentMethod] = None

    model_config = {"from_attributes": True}
