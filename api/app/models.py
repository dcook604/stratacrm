"""
SQLAlchemy 2.0 models for Spectrum 4 Strata CRM (BCS2611).
All entities from the PRD section 4 are defined here.
"""

import enum
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List

from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Integer,
    Numeric, String, Text, UniqueConstraint, JSON,
    Enum as SAEnum, Index,
)
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class PartyType(str, enum.Enum):
    individual = "individual"
    corporation = "corporation"


class ContactMethodType(str, enum.Enum):
    home_phone = "home_phone"
    cell_phone = "cell_phone"
    work_phone = "work_phone"
    email = "email"


class LotAssignmentRole(str, enum.Enum):
    owner_occupant = "owner_occupant"
    owner_absentee = "owner_absentee"
    tenant = "tenant"
    emergency_contact = "emergency_contact"
    key_holder = "key_holder"
    agent = "agent"
    property_manager_of_record = "property_manager_of_record"


class BylawCategory(str, enum.Enum):
    noise = "noise"
    pets = "pets"
    parking = "parking"
    common_property = "common_property"
    rental = "rental"
    alterations = "alterations"
    move_in_out = "move_in_out"
    smoking = "smoking"
    nuisance = "nuisance"
    other = "other"


class InfractionStatus(str, enum.Enum):
    open = "open"
    notice_sent = "notice_sent"
    response_received = "response_received"
    hearing_scheduled = "hearing_scheduled"
    fined = "fined"
    dismissed = "dismissed"
    appealed = "appealed"


class InfractionEventType(str, enum.Enum):
    complaint_received = "complaint_received"
    notice_sent = "notice_sent"
    response_received = "response_received"
    hearing_held = "hearing_held"
    decision_made = "decision_made"
    fine_levied = "fine_levied"
    payment_received = "payment_received"
    dismissed = "dismissed"


class DeliveryMethod(str, enum.Enum):
    email = "email"
    registered_mail = "registered_mail"
    posted = "posted"


class IncidentStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"


class IssueStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"


class IssuePriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class CommunicationChannel(str, enum.Enum):
    listmonk = "listmonk"
    transactional = "transactional"
    manual = "manual"


class UserRole(str, enum.Enum):
    admin = "admin"
    council_member = "council_member"
    property_manager = "property_manager"
    auditor = "auditor"


# ---------------------------------------------------------------------------
# System entities (defined first — referenced by many others)
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(300), unique=True, nullable=False, index=True)
    password_hash = Column(String(200), nullable=False)
    full_name = Column(String(200), nullable=False)
    role = Column(SAEnum(UserRole, name="userrole"), nullable=False, default=UserRole.council_member)
    is_active = Column(Boolean, nullable=False, default=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    password_reset_required = Column(Boolean, nullable=False, default=True)
    password_reset_token = Column(String(64), nullable=True, unique=True)
    password_reset_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    failed_login_attempts = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    last_activity_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_email = Column(String(300))          # denormalized for permanent record
    action = Column(String(50), nullable=False)  # create | update | delete | import | login | logout
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(Integer, nullable=True)
    changes = Column(JSON, nullable=True)          # before/after diff
    occurred_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    ip_address = Column(String(50), nullable=True)

    actor = relationship("User", foreign_keys=[actor_id])


# ---------------------------------------------------------------------------
# Core strata entities
# ---------------------------------------------------------------------------

class StrataCorporation(Base):
    __tablename__ = "strata_corporations"

    id = Column(Integer, primary_key=True)
    strata_plan = Column(String(50), unique=True, nullable=False)   # e.g. BCS2611
    name = Column(String(200), nullable=False)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    province = Column(String(50), nullable=True, default="BC")
    postal_code = Column(String(10), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    lots = relationship("Lot", back_populates="strata_corporation")


class Party(Base):
    """A person or corporation that can be associated with lots."""
    __tablename__ = "parties"

    id = Column(Integer, primary_key=True)
    party_type = Column(SAEnum(PartyType, name="partytype"), nullable=False, default=PartyType.individual)
    full_name = Column(String(300), nullable=False, index=True)
    is_property_manager = Column(Boolean, nullable=False, default=False)
    parent_party_id = Column(Integer, ForeignKey("parties.id", ondelete="SET NULL"), nullable=True)
    # Mailing address
    mailing_address_line1 = Column(String(200), nullable=True)
    mailing_address_line2 = Column(String(200), nullable=True)
    mailing_city = Column(String(100), nullable=True)
    mailing_province = Column(String(50), nullable=True)
    mailing_postal_code = Column(String(10), nullable=True)
    mailing_country = Column(String(100), nullable=True, default="Canada")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # c/o parent (e.g., owner c/o property management firm)
    parent = relationship("Party", remote_side="Party.id", foreign_keys=[parent_party_id])
    children = relationship("Party", foreign_keys=[parent_party_id], back_populates="parent")
    contact_methods = relationship(
        "ContactMethod", back_populates="party", cascade="all, delete-orphan", order_by="ContactMethod.id"
    )
    assignments = relationship("LotAssignment", back_populates="party", cascade="all, delete-orphan", passive_deletes=True)


class Lot(Base):
    """One strata lot. 245 total for BCS2611."""
    __tablename__ = "lots"

    id = Column(Integer, primary_key=True)
    strata_corporation_id = Column(Integer, ForeignKey("strata_corporations.id"), nullable=False)
    strata_lot_number = Column(Integer, nullable=False)   # SL# (1–245)
    unit_number = Column(String(20), nullable=True)        # suite label, e.g. "0802"
    square_feet = Column(Numeric(8, 2), nullable=True)
    parking_stalls = Column(Text, nullable=True)           # free text: "P1-042, P2-007"
    storage_lockers = Column(Text, nullable=True)
    bike_lockers = Column(Text, nullable=True)
    scooter_lockers = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    strata_corporation = relationship("StrataCorporation", back_populates="lots")
    assignments = relationship(
        "LotAssignment", back_populates="lot", order_by="LotAssignment.start_date.desc()"
    )
    infractions = relationship("Infraction", back_populates="lot")
    incidents = relationship("Incident", back_populates="lot")

    __table_args__ = (
        UniqueConstraint("strata_corporation_id", "strata_lot_number", name="uq_lot_strata_number"),
    )


class Document(Base):
    """Generic file attachment linked to any entity."""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True)
    storage_path = Column(String(500), nullable=False)
    original_filename = Column(String(300), nullable=True)
    mime_type = Column(String(100), nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    uploaded_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    linked_entity_type = Column(String(100), nullable=True)   # 'lot' | 'infraction' | 'incident' | 'party'
    linked_entity_id = Column(Integer, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    caption = Column(Text, nullable=True)
    tags = Column(String(500), nullable=True)  # comma-separated
    is_processing = Column(Boolean, nullable=False, server_default="false", default=False)

    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])


# ---------------------------------------------------------------------------
# Contact and assignment entities
# ---------------------------------------------------------------------------

class ContactMethod(Base):
    __tablename__ = "contact_methods"

    id = Column(Integer, primary_key=True)
    party_id = Column(Integer, ForeignKey("parties.id", ondelete="CASCADE"), nullable=False)
    method_type = Column(SAEnum(ContactMethodType, name="contactmethodtype"), nullable=False)
    value = Column(String(200), nullable=False)
    is_primary = Column(Boolean, nullable=False, default=False)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    party = relationship("Party", back_populates="contact_methods")


class LotAssignment(Base):
    """Ties a party to a lot with a role and date range."""
    __tablename__ = "lot_assignments"

    id = Column(Integer, primary_key=True)
    lot_id = Column(Integer, ForeignKey("lots.id", ondelete="CASCADE"), nullable=False)
    party_id = Column(Integer, ForeignKey("parties.id", ondelete="CASCADE"), nullable=False)
    role = Column(SAEnum(LotAssignmentRole, name="lotassignmentrole"), nullable=False)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    form_k_filed_date = Column(Date, nullable=True)   # SPA s.146 — tenants only
    is_current = Column(Boolean, nullable=False, default=True, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    lot = relationship("Lot", back_populates="assignments")
    party = relationship("Party", back_populates="assignments")

    __table_args__ = (
        Index("ix_lot_assignments_lot_current", "lot_id", "is_current"),
    )


# ---------------------------------------------------------------------------
# Bylaw enforcement entities
# ---------------------------------------------------------------------------

class Bylaw(Base):
    """Versioned bylaw library. Superseded bylaws are retained for historical infractions."""
    __tablename__ = "bylaws"

    id = Column(Integer, primary_key=True)
    bylaw_number = Column(String(50), nullable=False)
    section = Column(String(50), nullable=True)
    title = Column(String(300), nullable=False)
    full_text = Column(Text, nullable=False)
    category = Column(SAEnum(BylawCategory, name="bylawcategory"), nullable=False)
    active_from = Column(Date, nullable=False)
    superseded_by = Column(Integer, ForeignKey("bylaws.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    superseded_by_bylaw = relationship("Bylaw", remote_side="Bylaw.id", foreign_keys=[superseded_by])
    fine_schedules = relationship("FineSchedule", back_populates="bylaw")
    infractions = relationship("Infraction", back_populates="bylaw")


class FineSchedule(Base):
    """Fine amounts per bylaw and occurrence number.
    occurrence_number: 1 = first, 2 = second, 99 = third-and-subsequent.
    Caps: $200/contravention in most cases; $50 for rental violations (SPA Reg).
    """
    __tablename__ = "fine_schedules"

    id = Column(Integer, primary_key=True)
    bylaw_id = Column(Integer, ForeignKey("bylaws.id", ondelete="CASCADE"), nullable=False)
    occurrence_number = Column(Integer, nullable=False)
    fine_amount = Column(Numeric(10, 2), nullable=False)
    continuing_contravention_amount = Column(Numeric(10, 2), nullable=True)
    max_per_week = Column(Numeric(10, 2), nullable=True)

    bylaw = relationship("Bylaw", back_populates="fine_schedules")

    __table_args__ = (
        UniqueConstraint("bylaw_id", "occurrence_number", name="uq_fine_schedule_bylaw_occurrence"),
    )


class Infraction(Base):
    """Full lifecycle of one bylaw contravention complaint."""
    __tablename__ = "infractions"

    id = Column(Integer, primary_key=True)
    lot_id = Column(Integer, ForeignKey("lots.id"), nullable=False)
    primary_party_id = Column(Integer, ForeignKey("parties.id"), nullable=False)
    bylaw_id = Column(Integer, ForeignKey("bylaws.id"), nullable=False)
    complaint_received_date = Column(DateTime(timezone=True), nullable=False)
    complaint_source = Column(Text, nullable=True)     # confidential — restricted view
    description = Column(Text, nullable=False)
    status = Column(
        SAEnum(InfractionStatus, name="infractionstatus"),
        nullable=False,
        default=InfractionStatus.open,
        index=True,
    )
    assessed_fine_amount = Column(Numeric(10, 2), nullable=True)
    occurrence_number = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    lot = relationship("Lot", back_populates="infractions")
    primary_party = relationship("Party", foreign_keys=[primary_party_id])
    bylaw = relationship("Bylaw", back_populates="infractions")
    events = relationship(
        "InfractionEvent", back_populates="infraction", cascade="all, delete-orphan",
        order_by="InfractionEvent.occurred_at"
    )
    notices = relationship("Notice", back_populates="infraction")


class InfractionEvent(Base):
    """Append-only audit trail for each infraction (s.135 compliance trail)."""
    __tablename__ = "infraction_events"

    id = Column(Integer, primary_key=True)
    infraction_id = Column(Integer, ForeignKey("infractions.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(SAEnum(InfractionEventType, name="infractioneventtype"), nullable=False)
    occurred_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_email = Column(String(200), nullable=True)   # denormalized
    notes = Column(Text, nullable=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)

    infraction = relationship("Infraction", back_populates="events")
    actor = relationship("User", foreign_keys=[actor_id])
    document = relationship("Document", foreign_keys=[document_id])


class Notice(Base):
    """Rendered s.135 correspondence tied to an infraction."""
    __tablename__ = "notices"

    id = Column(Integer, primary_key=True)
    infraction_id = Column(Integer, ForeignKey("infractions.id", ondelete="CASCADE"), nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    delivery_method = Column(SAEnum(DeliveryMethod, name="deliverymethod"), nullable=False)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    read_receipt = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    infraction = relationship("Infraction", back_populates="notices")
    document = relationship("Document", foreign_keys=[document_id])


# ---------------------------------------------------------------------------
# Operations entities
# ---------------------------------------------------------------------------

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True)
    reference = Column(String(12), unique=True, nullable=False, index=True)
    incident_date = Column(DateTime(timezone=True), nullable=False)
    lot_id = Column(Integer, ForeignKey("lots.id", ondelete="SET NULL"), nullable=True)
    common_area_description = Column(String(300), nullable=True)
    category = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    reported_by = Column(String(200), nullable=True)
    status = Column(SAEnum(IncidentStatus, name="incidentstatus"), nullable=False, default=IncidentStatus.open)
    resolution = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    lot = relationship("Lot", back_populates="incidents")
    issues = relationship("Issue", back_populates="related_incident", foreign_keys="Issue.related_incident_id")


class Issue(Base):
    """Maintenance and council action items."""
    __tablename__ = "issues"

    id = Column(Integer, primary_key=True)
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    assignee_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    priority = Column(SAEnum(IssuePriority, name="issuepriority"), nullable=False, default=IssuePriority.medium)
    status = Column(SAEnum(IssueStatus, name="issuestatus"), nullable=False, default=IssueStatus.open)
    related_lot_id = Column(Integer, ForeignKey("lots.id", ondelete="SET NULL"), nullable=True)
    related_incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    assignee = relationship("User", foreign_keys=[assignee_id])
    related_lot = relationship("Lot", foreign_keys=[related_lot_id])
    related_incident = relationship("Incident", back_populates="issues", foreign_keys=[related_incident_id])


class CommunicationsLog(Base):
    """Record of every outbound message (Listmonk or transactional)."""
    __tablename__ = "communications_log"

    id = Column(Integer, primary_key=True)
    channel = Column(SAEnum(CommunicationChannel, name="communicationchannel"), nullable=False)
    template_id = Column(String(200), nullable=True)
    recipient_party_id = Column(Integer, ForeignKey("parties.id", ondelete="SET NULL"), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    status = Column(String(50), nullable=True)
    message_id = Column(String(200), nullable=True)   # external delivery tracking ID
    subject = Column(String(500), nullable=True)
    body_preview = Column(Text, nullable=True)

    recipient_party = relationship("Party", foreign_keys=[recipient_party_id])
