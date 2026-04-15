from datetime import datetime, date
from typing import Optional, List, Literal
from pydantic import BaseModel
from app.models_import import ImportBatchStatus, StagedLotStatus, DuplicateConfidence


class ImportBatchOut(BaseModel):
    id: int
    original_filename: str
    uploaded_at: datetime
    status: ImportBatchStatus
    total_lots: int
    lots_confirmed: int
    lots_skipped: int
    lots_pending: int   # computed

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_batch(cls, batch) -> "ImportBatchOut":
        return cls(
            id=batch.id,
            original_filename=batch.original_filename,
            uploaded_at=batch.uploaded_at,
            status=batch.status,
            total_lots=batch.total_lots,
            lots_confirmed=batch.lots_confirmed,
            lots_skipped=batch.lots_skipped,
            lots_pending=max(0, batch.total_lots - batch.lots_confirmed - batch.lots_skipped),
        )


class StagedContactMethod(BaseModel):
    method_type: str
    value: str
    is_primary: bool = False


class StagedPartyOut(BaseModel):
    id: int
    role: str
    full_name: str
    party_type: str
    is_property_manager: bool
    parent_name: Optional[str]
    mailing_address_line1: Optional[str]
    mailing_address_line2: Optional[str]
    mailing_city: Optional[str]
    mailing_province: Optional[str]
    mailing_postal_code: Optional[str]
    contact_methods: List[StagedContactMethod]
    form_k_filed_date: Optional[date]
    notes: Optional[str]
    detected_duplicate_party_id: Optional[int]
    duplicate_confidence: DuplicateConfidence
    duplicate_party_name: Optional[str] = None   # populated in router from join
    action: Optional[str]
    merge_target_party_id: Optional[int]

    model_config = {"from_attributes": True}


class StagedLotOut(BaseModel):
    id: int
    strata_lot_number: int
    unit_number: Optional[str]
    lot_id: Optional[int]
    status: StagedLotStatus
    parties: List[StagedPartyOut]
    parse_warnings: List[str]
    has_duplicates: bool
    confirmed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class PaginatedStagedLots(BaseModel):
    items: List[StagedLotOut]
    total: int
    lots_pending: int
    lots_confirmed: int
    lots_skipped: int
    lots_with_issues: int   # has duplicates OR parse warnings


class SetPartyActionRequest(BaseModel):
    action: Literal["create", "merge", "skip"]
    merge_target_party_id: Optional[int] = None


class ConfirmLotResponse(BaseModel):
    created: int
    merged: int
    skipped: int
    batch_completed: bool
