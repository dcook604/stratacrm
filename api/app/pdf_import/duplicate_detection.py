"""
Duplicate party detection for the import pipeline.

Confidence levels
-----------------
high   — email address matches an existing contact_method exactly
medium — normalised full_name matches AND at least one phone number matches
low    — normalised full_name matches only

The result is written to ImportStagedParty.detected_duplicate_party_id and
.duplicate_confidence.  The reviewer then decides the action (create/merge/skip).
"""

from __future__ import annotations

import re
import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ContactMethod, ContactMethodType, Party
from app.models_import import DuplicateConfidence, ImportBatch, ImportStagedParty

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def detect_duplicates_for_batch(db: Session, batch: ImportBatch) -> None:
    """Populate duplicate_* fields on all staged parties in a batch."""
    for staged_lot in batch.staged_lots:
        for staged_party in staged_lot.parties:
            party_id, confidence = _find_duplicate(db, staged_party)
            staged_party.detected_duplicate_party_id = party_id
            staged_party.duplicate_confidence = confidence

            # Auto-set action defaults:
            # high confidence → suggest merge; low/medium → leave for reviewer
            if confidence == DuplicateConfidence.high and party_id:
                staged_party.action = "merge"
                staged_party.merge_target_party_id = party_id
            elif confidence == DuplicateConfidence.none:
                staged_party.action = "create"
            # medium/low: leave action=None (reviewer must decide)

    db.flush()


# ---------------------------------------------------------------------------
# Internal matching logic
# ---------------------------------------------------------------------------

def _find_duplicate(
    db: Session, staged: ImportStagedParty
) -> tuple[Optional[int], DuplicateConfidence]:
    """Return (party_id, confidence) for the best duplicate candidate, or (None, 'none')."""

    # Extract email and phone values from the staged party's contact_methods JSONB
    emails = [
        cm["value"].lower()
        for cm in (staged.contact_methods or [])
        if cm.get("method_type") == "email" and cm.get("value")
    ]
    phones = [
        _normalise_phone(cm["value"])
        for cm in (staged.contact_methods or [])
        if cm.get("method_type") in ("home_phone", "cell_phone", "work_phone") and cm.get("value")
    ]

    # 1. High-confidence: exact email match
    if emails:
        for email in emails:
            party_id = _match_by_email(db, email)
            if party_id:
                return party_id, DuplicateConfidence.high

    # 2. Medium-confidence: name normalise match + at least one phone match
    norm_name = _normalise_name(staged.full_name)
    if norm_name:
        candidates = _candidates_by_name(db, norm_name)
        for candidate_id, candidate_phones in candidates:
            norm_candidate_phones = [_normalise_phone(p) for p in candidate_phones]
            if any(p in norm_candidate_phones for p in phones if p):
                return candidate_id, DuplicateConfidence.medium

        # 3. Low-confidence: name match only
        if candidates:
            return candidates[0][0], DuplicateConfidence.low

    return None, DuplicateConfidence.none


def _match_by_email(db: Session, email: str) -> Optional[int]:
    row = db.execute(
        select(ContactMethod.party_id)
        .where(ContactMethod.method_type == ContactMethodType.email)
        .where(ContactMethod.value == email)
        .limit(1)
    ).first()
    return row[0] if row else None


def _candidates_by_name(
    db: Session, norm_name: str
) -> list[tuple[int, list[str]]]:
    """
    Return list of (party_id, [phone_values]) whose normalised name matches.
    Uses exact normalised match — the reviewer handles borderline cases.
    """
    parties = db.execute(
        select(Party.id, Party.full_name)
        .where(Party.full_name.ilike(f"%{norm_name[:30]}%"))   # substring guard
        .limit(10)
    ).all()

    results: list[tuple[int, list[str]]] = []
    for party_id, full_name in parties:
        if _normalise_name(full_name) == norm_name:
            # Fetch this party's phone numbers
            phone_rows = db.execute(
                select(ContactMethod.value)
                .where(ContactMethod.party_id == party_id)
                .where(ContactMethod.method_type.in_([
                    ContactMethodType.home_phone,
                    ContactMethodType.cell_phone,
                    ContactMethodType.work_phone,
                ]))
            ).scalars().all()
            results.append((party_id, list(phone_rows)))

    return results


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------

def _normalise_name(name: str) -> str:
    """Lower-case, strip punctuation, collapse whitespace."""
    name = name.lower()
    name = re.sub(r"[.,\-'\"()]", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def _normalise_phone(phone: str) -> str:
    """Keep only digits."""
    return re.sub(r"\D", "", phone)
