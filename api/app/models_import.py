"""
SQLAlchemy models for the owner-list import staging pipeline.

Workflow:
  1. Upload PDF → create ImportBatch + ImportStagedLots + ImportStagedParties
  2. Duplicate detection populates detected_duplicate_party_id / duplicate_confidence
  3. Reviewer sets action on each staged party (create / merge / skip)
  4. Confirm lot → writes to live lots/parties/lot_assignments tables
  5. Mark batch complete when all lots are confirmed or skipped
"""

import enum
from datetime import datetime, date
from typing import Optional, List

from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Integer,
    JSON, String, Text, Enum as SAEnum, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models import Base


class ImportBatchStatus(str, enum.Enum):
    pending = "pending"       # uploaded, not yet reviewed
    reviewing = "reviewing"   # reviewer is working through lots
    completed = "completed"   # all lots confirmed or skipped
    cancelled = "cancelled"


class StagedLotStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    skipped = "skipped"


class StagedPartyAction(str, enum.Enum):
    create = "create"
    merge = "merge"
    skip = "skip"


class DuplicateConfidence(str, enum.Enum):
    none = "none"
    low = "low"
    medium = "medium"
    high = "high"


class ImportBatch(Base):
    """One upload of an owner-list PDF."""
    __tablename__ = "import_batches"

    id = Column(Integer, primary_key=True)
    original_filename = Column(String(300), nullable=False)
    uploaded_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    uploaded_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    status = Column(
        SAEnum(ImportBatchStatus, name="importbatchstatus"),
        nullable=False,
        default=ImportBatchStatus.reviewing,
    )
    total_lots = Column(Integer, nullable=False, default=0)
    lots_confirmed = Column(Integer, nullable=False, default=0)
    lots_skipped = Column(Integer, nullable=False, default=0)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)

    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])
    staged_lots = relationship(
        "ImportStagedLot", back_populates="batch",
        order_by="ImportStagedLot.strata_lot_number",
        cascade="all, delete-orphan",
    )


class ImportStagedLot(Base):
    """One lot's worth of records extracted from the PDF."""
    __tablename__ = "import_staged_lots"

    id = Column(Integer, primary_key=True)
    batch_id = Column(Integer, ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False)
    # Resolved FK to the live lots table (NULL if SL# not found in DB)
    lot_id = Column(Integer, ForeignKey("lots.id", ondelete="SET NULL"), nullable=True)
    strata_lot_number = Column(Integer, nullable=False)
    unit_number = Column(String(20), nullable=True)   # as parsed from PDF
    status = Column(
        SAEnum(StagedLotStatus, name="stagedlotstatus"),
        nullable=False,
        default=StagedLotStatus.pending,
    )
    confirmed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    parse_warnings = Column(JSON, nullable=False, default=list)   # list[str]
    raw_text = Column(Text, nullable=True)   # the raw text block for debugging

    batch = relationship("ImportBatch", back_populates="staged_lots")
    lot = relationship("Lot", foreign_keys=[lot_id])
    confirmed_by = relationship("User", foreign_keys=[confirmed_by_id])
    parties = relationship(
        "ImportStagedParty", back_populates="staged_lot",
        cascade="all, delete-orphan",
        order_by="ImportStagedParty.id",
    )

    __table_args__ = (
        Index("ix_import_staged_lots_batch_sl", "batch_id", "strata_lot_number"),
    )


class ImportStagedParty(Base):
    """One party record staged for review before writing to parties table."""
    __tablename__ = "import_staged_parties"

    id = Column(Integer, primary_key=True)
    staged_lot_id = Column(
        Integer, ForeignKey("import_staged_lots.id", ondelete="CASCADE"), nullable=False
    )

    # Parsed party data
    role = Column(String(50), nullable=False)           # LotAssignmentRole value
    full_name = Column(String(300), nullable=False)
    party_type = Column(String(20), nullable=False, default="individual")
    is_property_manager = Column(Boolean, nullable=False, default=False)
    parent_name = Column(String(300), nullable=True)    # c/o name, resolved to party_id on confirm

    mailing_address_line1 = Column(String(200), nullable=True)
    mailing_address_line2 = Column(String(200), nullable=True)
    mailing_city = Column(String(100), nullable=True)
    mailing_province = Column(String(50), nullable=True)
    mailing_postal_code = Column(String(10), nullable=True)

    # JSONB: [{method_type, value, is_primary}]
    contact_methods = Column(JSON, nullable=False, default=list)

    form_k_filed_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)

    # Duplicate detection results
    detected_duplicate_party_id = Column(
        Integer, ForeignKey("parties.id", ondelete="SET NULL"), nullable=True
    )
    duplicate_confidence = Column(
        SAEnum(DuplicateConfidence, name="duplicateconfidence"),
        nullable=False,
        default=DuplicateConfidence.none,
    )

    # Reviewer decision
    action = Column(
        SAEnum(StagedPartyAction, name="stagedpartyaction"),
        nullable=True,   # NULL = not yet decided
    )
    merge_target_party_id = Column(
        Integer, ForeignKey("parties.id", ondelete="SET NULL"), nullable=True
    )

    staged_lot = relationship("ImportStagedLot", back_populates="parties")
    detected_duplicate = relationship("Party", foreign_keys=[detected_duplicate_party_id])
    merge_target = relationship("Party", foreign_keys=[merge_target_party_id])
