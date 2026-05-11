"""Pydantic schemas for lot summary reports."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class LotReportParty(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    role: str


class LotReportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    strata_lot_number: int
    unit_number: Optional[str]
    square_feet: Optional[Decimal]
    owners: list[str] = []
    tenants: list[str] = []
    open_infractions: int = 0
    total_infractions: int = 0
    open_incidents: int = 0
    total_incidents: int = 0
    open_issues: int = 0
    total_issues: int = 0
    latest_activity: Optional[datetime] = None


class PaginatedLotReports(BaseModel):
    items: list[LotReportSummary]
    total: int
    skip: int
    limit: int


class ReportInfraction(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: str
    bylaw_number: str
    bylaw_title: str
    complaint_received_date: date
    assessed_fine_amount: Optional[Decimal]
    occurrence_number: int
    party_name: Optional[str]
    created_at: datetime


class ReportIncident(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category: str
    incident_date: datetime
    status: str
    description: str
    reported_by: Optional[str]
    created_at: datetime


class ReportIssue(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    status: str
    priority: str
    due_date: Optional[date]
    assignee_name: Optional[str]
    created_at: datetime


class LotReportDetail(BaseModel):
    id: int
    strata_lot_number: int
    unit_number: Optional[str]
    square_feet: Optional[Decimal]
    parking_stalls: Optional[str]
    storage_lockers: Optional[str]
    notes: Optional[str]
    parties: list[LotReportParty] = []
    open_infractions: int = 0
    total_infractions: int = 0
    open_incidents: int = 0
    total_incidents: int = 0
    open_issues: int = 0
    total_issues: int = 0
    infractions: list[ReportInfraction] = []
    incidents: list[ReportIncident] = []
    issues: list[ReportIssue] = []
