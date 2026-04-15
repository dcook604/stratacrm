"""
Commits a confirmed staged lot's assignments into the live tables.

Strategy (v1 — non-destructive)
--------------------------------
- action="create" : create new Party + ContactMethods + LotAssignment
- action="merge"  : use existing Party (merge_target_party_id); add any
                    contact methods not already on file; create LotAssignment
- action="skip"   : do nothing for this staged party

Existing live assignments are NOT automatically ended on re-import.
The diff view in the UI surfaces departed parties; a council member
ends those manually (or via a future bulk-end feature).
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_action
from app.models import (
    ContactMethod, ContactMethodType,
    Lot, LotAssignment, LotAssignmentRole,
    Party, PartyType,
)
from app.models_import import (
    ImportBatch, ImportBatchStatus, ImportStagedLot, ImportStagedParty,
    StagedLotStatus,
)

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

def confirm_lot(
    db: Session,
    staged_lot: ImportStagedLot,
    actor_id: int,
    actor_email: str,
) -> dict:
    """
    Commit one staged lot.  All staged parties must have action set
    (create / merge / skip) before calling this.

    Returns a summary dict.
    """
    if staged_lot.lot_id is None:
        raise ValueError(
            f"SL{staged_lot.strata_lot_number} has no matching lot in the database. "
            "Import aborted for this lot."
        )

    created = merged = skipped = 0

    for sp in staged_lot.parties:
        action = sp.action or "create"

        if action == "skip":
            skipped += 1
            continue

        if action == "merge":
            party_id = sp.merge_target_party_id or sp.detected_duplicate_party_id
            if not party_id:
                log.warning(
                    "SL%s staged_party %s has action=merge but no merge target — creating instead",
                    staged_lot.strata_lot_number, sp.id,
                )
                party_id = _create_party(db, sp, actor_id, actor_email)
                created += 1
            else:
                _maybe_add_contacts(db, party_id, sp)
                merged += 1
        else:  # create
            party_id = _create_party(db, sp, actor_id, actor_email)
            created += 1

        # Resolve role enum
        try:
            role = LotAssignmentRole(sp.role)
        except ValueError:
            log.warning("Unknown role %r for SL%s — defaulting to owner_absentee", sp.role, staged_lot.strata_lot_number)
            role = LotAssignmentRole.owner_absentee

        form_k: Optional[date] = None
        if sp.form_k_filed_date:
            form_k = sp.form_k_filed_date

        assignment = LotAssignment(
            lot_id=staged_lot.lot_id,
            party_id=party_id,
            role=role,
            is_current=True,
            form_k_filed_date=form_k,
        )
        db.add(assignment)

    # Mark staged lot confirmed
    staged_lot.status = StagedLotStatus.confirmed
    staged_lot.confirmed_by_id = actor_id
    staged_lot.confirmed_at = datetime.now(timezone.utc)

    # Update batch counters
    batch = staged_lot.batch
    batch.lots_confirmed = (
        db.query(ImportStagedLot)
        .filter_by(batch_id=batch.id, status=StagedLotStatus.confirmed)
        .count()
        + 1  # include this one (not yet flushed)
    )

    log_action(
        db,
        action="import",
        entity_type="lot",
        entity_id=staged_lot.lot_id,
        changes={
            "batch_id": staged_lot.batch_id,
            "strata_lot_number": staged_lot.strata_lot_number,
            "created": created,
            "merged": merged,
            "skipped": skipped,
        },
        actor_id=actor_id,
        actor_email=actor_email,
    )

    return {"created": created, "merged": merged, "skipped": skipped}


def skip_lot(db: Session, staged_lot: ImportStagedLot, actor_id: int, actor_email: str) -> None:
    staged_lot.status = StagedLotStatus.skipped
    staged_lot.confirmed_by_id = actor_id
    staged_lot.confirmed_at = datetime.now(timezone.utc)

    batch = staged_lot.batch
    batch.lots_skipped = (
        db.query(ImportStagedLot)
        .filter_by(batch_id=batch.id, status=StagedLotStatus.skipped)
        .count()
        + 1
    )


def maybe_complete_batch(db: Session, batch: ImportBatch) -> bool:
    """
    If all lots are confirmed or skipped, mark the batch complete.
    Returns True if batch was completed.
    """
    pending = (
        db.query(ImportStagedLot)
        .filter_by(batch_id=batch.id, status=StagedLotStatus.pending)
        .count()
    )
    if pending == 0:
        batch.status = ImportBatchStatus.completed
        batch.completed_at = datetime.now(timezone.utc)
        return True
    return False


# ---------------------------------------------------------------------------
# Diff helper — compare staged vs current live assignments
# ---------------------------------------------------------------------------

def compute_diff(db: Session, staged_lot: ImportStagedLot) -> dict:
    """
    Compare staged parties against current live lot_assignments.
    Returns a dict with 'unchanged', 'new', 'departed' lists for display.
    """
    if not staged_lot.lot_id:
        return {"unchanged": [], "new": list(staged_lot.parties), "departed": []}

    current_assignments = db.execute(
        select(LotAssignment)
        .where(LotAssignment.lot_id == staged_lot.lot_id)
        .where(LotAssignment.is_current == True)  # noqa: E712
    ).scalars().all()

    current_party_ids = {a.party_id for a in current_assignments}

    staged_party_ids: set[int] = set()
    for sp in staged_lot.parties:
        target = sp.merge_target_party_id or sp.detected_duplicate_party_id
        if target:
            staged_party_ids.add(target)

    new_parties = [sp for sp in staged_lot.parties
                   if (sp.merge_target_party_id or sp.detected_duplicate_party_id) not in current_party_ids
                   or not (sp.merge_target_party_id or sp.detected_duplicate_party_id)]

    departed_ids = current_party_ids - staged_party_ids
    departed = []
    for pid in departed_ids:
        party = db.get(Party, pid)
        if party:
            departed.append({"party_id": pid, "full_name": party.full_name})

    return {
        "new": [{"full_name": p.full_name, "role": p.role} for p in new_parties],
        "departed": departed,
        "unchanged": [],  # simplified — full matching is complex
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _create_party(
    db: Session, sp: ImportStagedParty, actor_id: int, actor_email: str
) -> int:
    try:
        pt = PartyType(sp.party_type)
    except ValueError:
        pt = PartyType.individual

    party = Party(
        party_type=pt,
        full_name=sp.full_name,
        is_property_manager=sp.is_property_manager,
        mailing_address_line1=sp.mailing_address_line1,
        mailing_address_line2=sp.mailing_address_line2,
        mailing_city=sp.mailing_city,
        mailing_province=sp.mailing_province,
        mailing_postal_code=sp.mailing_postal_code,
        mailing_country="Canada",
        notes=sp.notes,
    )
    db.add(party)
    db.flush()

    for cm_data in (sp.contact_methods or []):
        try:
            cm_type = ContactMethodType(cm_data["method_type"])
        except (KeyError, ValueError):
            continue
        db.add(ContactMethod(
            party_id=party.id,
            method_type=cm_type,
            value=cm_data.get("value", ""),
            is_primary=cm_data.get("is_primary", False),
        ))

    log_action(
        db,
        action="create",
        entity_type="party",
        entity_id=party.id,
        changes={"full_name": party.full_name, "source": "import"},
        actor_id=actor_id,
        actor_email=actor_email,
    )
    return party.id


def _maybe_add_contacts(db: Session, party_id: int, sp: ImportStagedParty) -> None:
    """Add contact methods from staged party that don't already exist on the live party."""
    existing_values = set(
        db.execute(
            select(ContactMethod.value).where(ContactMethod.party_id == party_id)
        ).scalars().all()
    )
    for cm_data in (sp.contact_methods or []):
        value = cm_data.get("value", "")
        if value and value not in existing_values:
            try:
                cm_type = ContactMethodType(cm_data["method_type"])
            except (KeyError, ValueError):
                continue
            db.add(ContactMethod(
                party_id=party_id,
                method_type=cm_type,
                value=value,
                is_primary=False,   # don't override existing primary
            ))
            existing_values.add(value)
