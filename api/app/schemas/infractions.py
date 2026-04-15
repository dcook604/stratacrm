"""Pydantic schemas for infractions, events, and notices."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List

from pydantic import BaseModel, ConfigDict

from app.models import (
    BylawCategory,
    DeliveryMethod,
    InfractionEventType,
    InfractionStatus,
)


# ---------------------------------------------------------------------------
# Embedded mini schemas
# ---------------------------------------------------------------------------

class BylawMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    bylaw_number: str
    section: Optional[str]
    title: str
    category: BylawCategory


class PartyMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str


class LotMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    strata_lot_number: int
    unit_number: Optional[str]


class FineScheduleMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    occurrence_number: int
    fine_amount: Decimal
    continuing_contravention_amount: Optional[Decimal]
    max_per_week: Optional[Decimal]


# ---------------------------------------------------------------------------
# Infraction
# ---------------------------------------------------------------------------

class InfractionCreate(BaseModel):
    lot_id: int
    primary_party_id: int
    bylaw_id: int
    complaint_received_date: date
    complaint_source: Optional[str] = None   # confidential — not returned to non-admin
    description: str


class InfractionUpdate(BaseModel):
    """Limited fields council can edit after creation."""
    description: Optional[str] = None
    assessed_fine_amount: Optional[Decimal] = None


class InfractionListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    lot: LotMini
    primary_party: PartyMini
    bylaw: BylawMini
    status: InfractionStatus
    complaint_received_date: date
    assessed_fine_amount: Optional[Decimal]
    occurrence_number: int
    created_at: datetime


# ---------------------------------------------------------------------------
# Infraction events
# ---------------------------------------------------------------------------

class InfractionEventCreate(BaseModel):
    event_type: InfractionEventType
    occurred_at: Optional[datetime] = None   # defaults to now() server-side
    notes: Optional[str] = None


class InfractionEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    infraction_id: int
    event_type: InfractionEventType
    occurred_at: datetime
    actor_email: Optional[str]
    notes: Optional[str]
    document_id: Optional[int]


# ---------------------------------------------------------------------------
# Notices
# ---------------------------------------------------------------------------

class NoticeCreate(BaseModel):
    delivery_method: DeliveryMethod
    send_email: bool = False    # only meaningful when delivery_method == email


class NoticeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    infraction_id: int
    document_id: Optional[int]
    delivery_method: DeliveryMethod
    delivered_at: Optional[datetime]
    created_at: datetime
    pdf_url: Optional[str] = None   # set by endpoint


# ---------------------------------------------------------------------------
# Full infraction detail
# ---------------------------------------------------------------------------

class InfractionDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    lot: LotMini
    primary_party: PartyMini
    bylaw: BylawMini
    applicable_fine: Optional[FineScheduleMini] = None
    status: InfractionStatus
    complaint_received_date: date
    description: str
    assessed_fine_amount: Optional[Decimal]
    occurrence_number: int
    events: List[InfractionEventOut] = []
    notices: List[NoticeOut] = []
    created_at: datetime
    updated_at: datetime
