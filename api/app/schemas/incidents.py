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
    incident_date: date
    lot_id: Optional[int] = None
    common_area_description: Optional[str] = None
    category: str
    description: str
    reported_by: Optional[str] = None


class IncidentUpdate(BaseModel):
    incident_date: Optional[date] = None
    lot_id: Optional[int] = None
    common_area_description: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    reported_by: Optional[str] = None
    status: Optional[IncidentStatus] = None
    resolution: Optional[str] = None


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    incident_date: date
    lot: Optional[LotMini] = None
    common_area_description: Optional[str]
    category: str
    description: str
    reported_by: Optional[str]
    status: IncidentStatus
    resolution: Optional[str]
    created_at: datetime
    updated_at: datetime
