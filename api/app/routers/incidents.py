"""Incident log router — property/common-area incidents and their status."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.audit import log_action
from app.database import get_db
from app.dependencies import get_current_user, require_csrf, require_write
from app.models import Incident, IncidentStatus, Lot, User
from app.schemas.incidents import IncidentCreate, IncidentOut, IncidentUpdate
from app.utils.reference import generate_reference

router = APIRouter(prefix="/incidents", tags=["incidents"])


def _load(incident_id: int, db: Session) -> Incident:
    inc = db.execute(
        select(Incident)
        .where(Incident.id == incident_id)
        .options(selectinload(Incident.lot))
    ).scalar_one_or_none()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    return inc


@router.get("", response_model=list[IncidentOut])
def list_incidents(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    status_filter: Optional[IncidentStatus] = Query(None, alias="status"),
    lot_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    open_only: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    stmt = (
        select(Incident)
        .options(selectinload(Incident.lot))
        .order_by(Incident.incident_date.desc(), Incident.id.desc())
    )
    if status_filter:
        stmt = stmt.where(Incident.status == status_filter)
    if open_only:
        stmt = stmt.where(Incident.status.in_([IncidentStatus.open, IncidentStatus.in_progress]))
    if lot_id:
        stmt = stmt.where(Incident.lot_id == lot_id)
    if category:
        stmt = stmt.where(Incident.category.ilike(f"%{category}%"))
    stmt = stmt.offset(skip).limit(limit)
    return db.execute(stmt).scalars().all()


@router.post("", response_model=IncidentOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_csrf)])
def create_incident(
    request: Request,
    body: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    if body.lot_id and not db.get(Lot, body.lot_id):
        raise HTTPException(status_code=404, detail="Lot not found")

    inc = Incident(reference=generate_reference("TKT"), **body.model_dump())
    db.add(inc)
    log_action(db, action="create", entity_type="incident", entity_id=None,
               changes=body.model_dump(mode="json"),
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    db.refresh(inc)
    return _load(inc.id, db)


@router.get("/{incident_id}", response_model=IncidentOut)
def get_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return _load(incident_id, db)


@router.patch("/{incident_id}", response_model=IncidentOut,
              dependencies=[Depends(require_csrf)])
def update_incident(
    incident_id: int,
    request: Request,
    body: IncidentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    inc = db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    updates = body.model_dump(exclude_unset=True)
    if "lot_id" in updates and updates["lot_id"] and not db.get(Lot, updates["lot_id"]):
        raise HTTPException(status_code=404, detail="Lot not found")

    for field, value in updates.items():
        setattr(inc, field, value)

    log_action(db, action="update", entity_type="incident", entity_id=incident_id,
               changes=body.model_dump(exclude_unset=True, mode="json"),
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    return _load(incident_id, db)


@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_csrf)])
def delete_incident(
    incident_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    inc = db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    log_action(db, action="delete", entity_type="incident", entity_id=incident_id,
               changes={},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.delete(inc)
    db.commit()
