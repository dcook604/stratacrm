"""Pydantic schemas for bylaws and fine schedules."""

from datetime import date
from decimal import Decimal
from typing import Optional, List

from pydantic import BaseModel, ConfigDict, model_validator

from app.models import BylawCategory


class FineScheduleCreate(BaseModel):
    occurrence_number: int          # 1 = first, 2 = second, 99 = third+
    fine_amount: Decimal
    continuing_contravention_amount: Optional[Decimal] = None
    max_per_week: Optional[Decimal] = None


class FineScheduleOut(FineScheduleCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    bylaw_id: int


class BylawCreate(BaseModel):
    bylaw_number: str
    section: Optional[str] = None
    title: str
    full_text: str
    category: BylawCategory
    active_from: date


class BylawUpdate(BaseModel):
    bylaw_number: Optional[str] = None
    section: Optional[str] = None
    title: Optional[str] = None
    full_text: Optional[str] = None
    category: Optional[BylawCategory] = None
    active_from: Optional[date] = None


class BylawListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    bylaw_number: str
    section: Optional[str]
    title: str
    category: BylawCategory
    active_from: date
    is_superseded: bool = False


class BylawOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    bylaw_number: str
    section: Optional[str]
    title: str
    full_text: str
    category: BylawCategory
    active_from: date
    superseded_by: Optional[int]
    fine_schedules: List[FineScheduleOut] = []


class BylawBulkItem(BaseModel):
    bylaw_number: str
    section: Optional[str] = None
    title: str
    full_text: str
    category: BylawCategory
    active_from: date
    supersede_bylaw_number: Optional[str] = None


class BylawBulkRequest(BaseModel):
    bylaws: List[BylawBulkItem]
    supersede_all_existing: bool = False

    @model_validator(mode="after")
    def check_not_empty(self) -> "BylawBulkRequest":
        if not self.bylaws:
            raise ValueError("bylaws list must not be empty")
        return self


class BylawBulkResult(BaseModel):
    created: int
    superseded: int
    errors: List[dict]
