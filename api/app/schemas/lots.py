from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel
from app.models import LotAssignmentRole, PartyType


class PartyMini(BaseModel):
    id: int
    full_name: str
    party_type: PartyType

    model_config = {"from_attributes": True}


class AssignmentDetail(BaseModel):
    id: int
    party: PartyMini
    role: LotAssignmentRole
    start_date: Optional[date]
    end_date: Optional[date]
    is_current: bool
    form_k_filed_date: Optional[date]
    notes: Optional[str]

    model_config = {"from_attributes": True}


class LotUpdate(BaseModel):
    unit_number: Optional[str] = None
    square_feet: Optional[Decimal] = None
    parking_stalls: Optional[str] = None
    storage_lockers: Optional[str] = None
    bike_lockers: Optional[str] = None
    scooter_lockers: Optional[str] = None
    bedrooms: Optional[int] = None
    is_townhouse: Optional[bool] = None
    suspected_airbnb: Optional[bool] = None
    renting_locker: Optional[bool] = None
    locker_number: Optional[str] = None
    locker_signup_date: Optional[date] = None
    notes: Optional[str] = None


class LotOut(BaseModel):
    id: int
    strata_lot_number: int
    unit_number: Optional[str]
    square_feet: Optional[Decimal]
    parking_stalls: Optional[str]
    storage_lockers: Optional[str]
    bike_lockers: Optional[str]
    scooter_lockers: Optional[str]
    bedrooms: Optional[int]
    is_townhouse: Optional[bool]
    suspected_airbnb: Optional[bool]
    renting_locker: Optional[bool]
    locker_number: Optional[str]
    locker_signup_date: Optional[date]
    notes: Optional[str]
    updated_at: datetime
    current_assignments: List[AssignmentDetail] = []

    model_config = {"from_attributes": True}


class LotListItem(BaseModel):
    id: int
    strata_lot_number: int
    unit_number: Optional[str]
    square_feet: Optional[Decimal]
    suspected_airbnb: Optional[bool]
    owners: List[str] = []       # full_name strings for quick display
    tenants: List[str] = []

    model_config = {"from_attributes": True}


class PaginatedLots(BaseModel):
    items: List[LotListItem]
    total: int
    skip: int
    limit: int


class LotAssignmentCreate(BaseModel):
    party_id: int
    role: LotAssignmentRole
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    form_k_filed_date: Optional[date] = None
    notes: Optional[str] = None


class LotAssignmentUpdate(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    form_k_filed_date: Optional[date] = None
    is_current: Optional[bool] = None
    notes: Optional[str] = None
