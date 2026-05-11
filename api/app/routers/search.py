"""Cross-entity search — find parties, lots, infractions, incidents, and issues in one query."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Incident,
    Infraction,
    Issue,
    Lot,
    Party,
    User,
)

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
def search(
    q: str = Query(..., min_length=1, max_length=200),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    pattern = f"%{q}%"

    # Parties — match full_name
    parties = db.execute(
        select(Party)
        .where(Party.full_name.ilike(pattern))
        .options(selectinload(Party.contact_methods))
        .limit(10)
    ).scalars().all()

    # Lots — match unit_number or strata_lot_number (string)
    lots = db.execute(
        select(Lot)
        .where(
            or_(
                Lot.unit_number.ilike(pattern),
                func.cast(Lot.strata_lot_number, type_=str).ilike(pattern),
            )
        )
        .limit(10)
    ).scalars().all()

    # Infractions — match by-law description via join
    from app.models import Bylaw

    infractions = db.execute(
        select(Infraction)
        .join(Bylaw, Infraction.bylaw_id == Bylaw.id)
        .where(Bylaw.description.ilike(pattern))
        .options(
            selectinload(Infraction.lot),
            selectinload(Infraction.primary_party),
            selectinload(Infraction.bylaw),
        )
        .limit(10)
    ).scalars().all()

    # Incidents — match title or description
    incidents = db.execute(
        select(Incident)
        .where(or_(Incident.title.ilike(pattern), Incident.description.ilike(pattern)))
        .options(selectinload(Incident.lot), selectinload(Incident.reported_by_party))
        .limit(10)
    ).scalars().all()

    # Issues — match title or description
    issues = db.execute(
        select(Issue)
        .where(or_(Issue.title.ilike(pattern), Issue.description.ilike(pattern)))
        .options(selectinload(Issue.lot), selectinload(Issue.assignee))
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
                "bylaw_description": i.bylaw.description if i.bylaw else None,
                "status": i.status.value,
            }
            for i in infractions
        ],
        "incidents": [
            {
                "id": i.id,
                "title": i.title,
                "status": i.status.value if i.status else None,
                "lot_number": i.lot.strata_lot_number if i.lot else None,
            }
            for i in incidents
        ],
        "issues": [
            {
                "id": i.id,
                "title": i.title,
                "status": i.status.value if i.status else None,
                "lot_number": i.lot.strata_lot_number if i.lot else None,
            }
            for i in issues
        ],
    }
