"""Pydantic schemas for incidents."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models import IncidentStatus


class LotMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    strata_lot_number: int
    unit_number: Optional[str]


class IncidentCreate(BaseModel):
    incident_date: datetime
    lot_id: Optional[int] = None
    common_area_description: Optional[str] = None
    category: str
    description: str
    reported_by: Optional[str] = None


class IncidentUpdate(BaseModel):
    incident_date: Optional[datetime] = None
    lot_id: Optional[int] = None
    common_area_description: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    reported_by: Optional[str] = None
    status: Optional[IncidentStatus] = None
    resolution: Optional[str] = None


class IncidentMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reference: str
    category: str
    description: str


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reference: str
    incident_date: datetime
    lot: Optional[LotMini] = None
    common_area_description: Optional[str]
    category: str
    description: str
    reported_by: Optional[str]
    status: IncidentStatus
    resolution: Optional[str]
    source: str = "manual"
    reporter_email: Optional[str] = None
    raw_unit_hint: Optional[str] = None
    merged_into: Optional[IncidentMini] = None
    merged_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class PaginatedIncidents(BaseModel):
    items: list[IncidentOut]
    total: int
    skip: int
    limit: int


class IncidentMergeRequest(BaseModel):
    merge_ids: list[int]


class IncidentNoteCreate(BaseModel):
    content: str


class IncidentNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    incident_id: int
    content: str
    source: str
    author_email: Optional[str]
    author_name: Optional[str]
    created_at: datetime
