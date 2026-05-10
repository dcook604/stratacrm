"""Pydantic schemas for issues (maintenance and council action items)."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models import IssuePriority, IssueStatus


class UserMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    full_name: str


class LotMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    strata_lot_number: int
    unit_number: Optional[str]


class IncidentMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category: str
    incident_date: datetime


class IssueCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None
    priority: IssuePriority = IssuePriority.medium
    related_lot_id: Optional[int] = None
    related_incident_id: Optional[int] = None


class IssueUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None
    priority: Optional[IssuePriority] = None
    status: Optional[IssueStatus] = None
    related_lot_id: Optional[int] = None
    related_incident_id: Optional[int] = None


class IssueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    description: Optional[str]
    assignee: Optional[UserMini]
    due_date: Optional[datetime]
    priority: IssuePriority
    status: IssueStatus
    related_lot: Optional[LotMini] = None
    related_incident: Optional[IncidentMini] = None
    created_at: datetime
    updated_at: datetime


class IssueNoteCreate(BaseModel):
    content: str


class IssueNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    issue_id: int
    content: str
    source: str
    author_email: Optional[str]
    author_name: Optional[str]
    created_at: datetime
