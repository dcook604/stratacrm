from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, EmailStr
from app.models import PartyType, ContactMethodType, LotAssignmentRole


class ContactMethodOut(BaseModel):
    id: int
    method_type: ContactMethodType
    value: str
    is_primary: bool
    verified_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ContactMethodCreate(BaseModel):
    method_type: ContactMethodType
    value: str
    is_primary: bool = False


class ContactMethodUpdate(BaseModel):
    value: Optional[str] = None
    is_primary: Optional[bool] = None


class LotSummary(BaseModel):
    id: int
    strata_lot_number: int
    unit_number: Optional[str]

    model_config = {"from_attributes": True}


class AssignmentOut(BaseModel):
    id: int
    lot: LotSummary
    role: LotAssignmentRole
    start_date: Optional[date]
    end_date: Optional[date]
    is_current: bool
    form_k_filed_date: Optional[date]

    model_config = {"from_attributes": True}


class PartyCreate(BaseModel):
    party_type: PartyType = PartyType.individual
    full_name: str
    is_property_manager: bool = False
    parent_party_id: Optional[int] = None
    mailing_address_line1: Optional[str] = None
    mailing_address_line2: Optional[str] = None
    mailing_city: Optional[str] = None
    mailing_province: Optional[str] = None
    mailing_postal_code: Optional[str] = None
    mailing_country: Optional[str] = "Canada"
    notes: Optional[str] = None
    contact_methods: List[ContactMethodCreate] = []


class PartyUpdate(BaseModel):
    full_name: Optional[str] = None
    party_type: Optional[PartyType] = None
    is_property_manager: Optional[bool] = None
    parent_party_id: Optional[int] = None
    mailing_address_line1: Optional[str] = None
    mailing_address_line2: Optional[str] = None
    mailing_city: Optional[str] = None
    mailing_province: Optional[str] = None
    mailing_postal_code: Optional[str] = None
    mailing_country: Optional[str] = None
    notes: Optional[str] = None


class PartyOut(BaseModel):
    id: int
    party_type: PartyType
    full_name: str
    is_property_manager: bool
    parent_party_id: Optional[int]
    mailing_address_line1: Optional[str]
    mailing_address_line2: Optional[str]
    mailing_city: Optional[str]
    mailing_province: Optional[str]
    mailing_postal_code: Optional[str]
    mailing_country: Optional[str]
    notes: Optional[str]
    created_at: datetime
    contact_methods: List[ContactMethodOut] = []
    current_assignments: List[AssignmentOut] = []

    model_config = {"from_attributes": True}


class PartyListItem(BaseModel):
    id: int
    party_type: PartyType
    full_name: str
    is_property_manager: bool
    primary_email: Optional[str] = None
    primary_phone: Optional[str] = None
    lot_count: int = 0

    model_config = {"from_attributes": True}


class PaginatedParties(BaseModel):
    items: List[PartyListItem]
    total: int
    skip: int
    limit: int
