"""Cross-entity full-text search — powered by PostgreSQL tsvector/tsquery.

Each searchable table has a `search_vector` column maintained by a trigger
that concatenates and weights relevant text fields. The endpoint uses
`websearch_to_tsquery` (supports quoted phrases, -exclude, OR) and
`ts_rank` for relevance ordering.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Bylaw,
    Incident,
    Infraction,
    Issue,
    Lot,
    Party,
    User,
)

router = APIRouter(prefix="/search", tags=["search"])


def _tsquery(q: str):
    """Parse user text into a tsquery using PostgreSQL's websearch syntax."""
    return func.websearch_to_tsquery("english", q)


def _rank(vector, tsquery):
    """Rank results by relevance."""
    return func.ts_rank(vector, tsquery).desc()


@router.get("")
def search(
    q: str = Query(..., min_length=1, max_length=200),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tq = _tsquery(q)

    # Parties — full_name (A), notes (B)
    parties = db.execute(
        select(Party)
        .where(Party.search_vector.op("@@")(tq))
        .options(selectinload(Party.contact_methods))
        .order_by(_rank(Party.search_vector, tq))
        .limit(10)
    ).scalars().all()

    # Lots — unit_number (A), notes (B), parking/storage/lockers (C)
    lots = db.execute(
        select(Lot)
        .where(Lot.search_vector.op("@@")(tq))
        .order_by(_rank(Lot.search_vector, tq))
        .limit(10)
    ).scalars().all()

    # Infractions — description (A), complaint_source (B)
    infractions = db.execute(
        select(Infraction)
        .where(Infraction.search_vector.op("@@")(tq))
        .options(
            selectinload(Infraction.lot),
            selectinload(Infraction.primary_party),
            selectinload(Infraction.bylaw),
        )
        .order_by(_rank(Infraction.search_vector, tq))
        .limit(10)
    ).scalars().all()

    # Incidents — description (A), category/reference/area (B), reported_by (C)
    incidents = db.execute(
        select(Incident)
        .where(Incident.search_vector.op("@@")(tq))
        .options(selectinload(Incident.lot))
        .order_by(_rank(Incident.search_vector, tq))
        .limit(10)
    ).scalars().all()

    # Issues — title (A), description (B)
    issues = db.execute(
        select(Issue)
        .where(Issue.search_vector.op("@@")(tq))
        .options(selectinload(Issue.related_lot), selectinload(Issue.assignee))
        .order_by(_rank(Issue.search_vector, tq))
        .limit(10)
    ).scalars().all()

    return {
        "parties": [
            {
                "id": p.id,
                "full_name": p.full_name,
                "party_type": p.party_type,
                "email": next(
                    (cm.value for cm in p.contact_methods if cm.method_type == "email"),
                    None,
                ),
            }
            for p in parties
        ],
        "lots": [
            {
                "id": l.id,
                "strata_lot_number": l.strata_lot_number,
                "unit_number": l.unit_number,
            }
            for l in lots
        ],
        "infractions": [
            {
                "id": i.id,
                "lot_number": i.lot.strata_lot_number if i.lot else None,
                "unit_number": i.lot.unit_number if i.lot else None,
                "party_name": i.primary_party.full_name if i.primary_party else None,
                "bylaw_description": i.bylaw.title if i.bylaw else None,
                "status": i.status.value,
            }
            for i in infractions
        ],
        "incidents": [
            {
                "id": i.id,
                "reference": i.reference,
                "description": i.description[:200] if i.description else None,
                "category": i.category,
                "status": i.status.value,
                "lot_number": i.lot.strata_lot_number if i.lot else None,
            }
            for i in incidents
        ],
        "issues": [
            {
                "id": i.id,
                "title": i.title,
                "status": i.status.value,
                "lot_number": i.related_lot.strata_lot_number if i.related_lot else None,
                "assignee_name": i.assignee.full_name if i.assignee else None,
            }
            for i in issues
        ],
    }
