"""Bylaw library and fine schedule CRUD router."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.audit import log_action
from app.database import get_db
from app.dependencies import get_current_user, require_csrf, require_write
from app.models import Bylaw, BylawCategory, FineSchedule, User
from app.schemas.bylaws import (
    BylawBulkRequest,
    BylawBulkResult,
    BylawCreate,
    BylawListItem,
    BylawOut,
    BylawUpdate,
    FineScheduleCreate,
    FineScheduleOut,
)

router = APIRouter(prefix="/bylaws", tags=["bylaws"])


def _load_bylaw(bylaw_id: int, db: Session) -> Bylaw:
    bylaw = db.execute(
        select(Bylaw)
        .where(Bylaw.id == bylaw_id)
        .options(selectinload(Bylaw.fine_schedules))
    ).scalar_one_or_none()
    if not bylaw:
        raise HTTPException(status_code=404, detail="Bylaw not found")
    return bylaw


@router.get("", response_model=list[BylawListItem])
def list_bylaws(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    category: Optional[BylawCategory] = Query(None),
    active_only: bool = Query(True, description="Exclude superseded bylaws"),
    search: Optional[str] = Query(None),
):
    stmt = select(Bylaw)
    if active_only:
        stmt = stmt.where(Bylaw.superseded_by.is_(None))
    if category:
        stmt = stmt.where(Bylaw.category == category)
    if search:
        stmt = stmt.where(Bylaw.title.ilike(f"%{search}%"))
    stmt = stmt.order_by(Bylaw.bylaw_number)

    bylaws = db.execute(stmt).scalars().all()
    return [
        BylawListItem(
            id=b.id,
            bylaw_number=b.bylaw_number,
            section=b.section,
            title=b.title,
            category=b.category,
            active_from=b.active_from,
            is_superseded=b.superseded_by is not None,
        )
        for b in bylaws
    ]


@router.post("", response_model=BylawOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_csrf)])
def create_bylaw(
    request: Request,
    body: BylawCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    bylaw = Bylaw(**body.model_dump())
    db.add(bylaw)
    log_action(db, action="create", entity_type="bylaw", entity_id=None,
               changes=body.model_dump(mode="json"),
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    db.refresh(bylaw)
    return _load_bylaw(bylaw.id, db)


@router.get("/{bylaw_id}", response_model=BylawOut)
def get_bylaw(
    bylaw_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return _load_bylaw(bylaw_id, db)


@router.put("/{bylaw_id}", response_model=BylawOut, dependencies=[Depends(require_csrf)])
def update_bylaw(
    bylaw_id: int,
    request: Request,
    body: BylawUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    bylaw = db.get(Bylaw, bylaw_id)
    if not bylaw:
        raise HTTPException(status_code=404, detail="Bylaw not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(bylaw, field, value)

    log_action(db, action="update", entity_type="bylaw", entity_id=bylaw_id,
               changes=body.model_dump(exclude_unset=True, mode="json"),
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    return _load_bylaw(bylaw_id, db)


# ---------------------------------------------------------------------------
# Bulk import / version replacement
# ---------------------------------------------------------------------------

@router.post("/bulk", response_model=BylawBulkResult, dependencies=[Depends(require_csrf)])
def bulk_import_bylaws(
    request: Request,
    body: BylawBulkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    """Create multiple bylaws at once and optionally supersede all existing active bylaws."""
    created_bylaws: list[Bylaw] = []
    errors: list[dict] = []

    for idx, item in enumerate(body.bylaws):
        try:
            data = item.model_dump(exclude={"supersede_bylaw_number"})
            new_bylaw = Bylaw(**data)
            db.add(new_bylaw)
            db.flush()  # get the id before commit
            created_bylaws.append(new_bylaw)

            # Per-item supersession: mark the named existing bylaw as superseded.
            if item.supersede_bylaw_number:
                old = db.execute(
                    select(Bylaw)
                    .where(Bylaw.bylaw_number == item.supersede_bylaw_number)
                    .where(Bylaw.superseded_by.is_(None))
                ).scalar_one_or_none()
                if old:
                    old.superseded_by = new_bylaw.id
        except Exception as exc:
            errors.append({"index": idx, "bylaw_number": item.bylaw_number, "error": str(exc)})
            db.rollback()
            continue

    superseded_count = sum(
        1 for item in body.bylaws if item.supersede_bylaw_number
    )

    # Global supersession: mark every still-active bylaw (not in created set) as superseded.
    if body.supersede_all_existing and created_bylaws:
        representative = created_bylaws[0]
        new_ids = {b.id for b in created_bylaws}
        old_bylaws = db.execute(
            select(Bylaw)
            .where(Bylaw.superseded_by.is_(None))
            .where(Bylaw.id.not_in(new_ids))
        ).scalars().all()
        for old in old_bylaws:
            old.superseded_by = representative.id
            superseded_count += 1

    log_action(
        db, action="bulk_import", entity_type="bylaw", entity_id=None,
        changes={"created": len(created_bylaws), "superseded": superseded_count, "errors": len(errors)},
        actor_id=current_user.id, actor_email=current_user.email, request=request,
    )
    db.commit()

    return BylawBulkResult(created=len(created_bylaws), superseded=superseded_count, errors=errors)


# ---------------------------------------------------------------------------
# Fine schedule sub-resource
# ---------------------------------------------------------------------------

@router.post("/{bylaw_id}/fine-schedules", response_model=FineScheduleOut,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
def upsert_fine_schedule(
    bylaw_id: int,
    request: Request,
    body: FineScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    """Add or replace a fine schedule entry for a given occurrence number."""
    bylaw = db.get(Bylaw, bylaw_id)
    if not bylaw:
        raise HTTPException(status_code=404, detail="Bylaw not found")

    # Replace existing entry for same occurrence_number if present
    existing = db.execute(
        select(FineSchedule)
        .where(FineSchedule.bylaw_id == bylaw_id)
        .where(FineSchedule.occurrence_number == body.occurrence_number)
    ).scalar_one_or_none()

    if existing:
        for field, value in body.model_dump().items():
            setattr(existing, field, value)
        fs = existing
    else:
        fs = FineSchedule(bylaw_id=bylaw_id, **body.model_dump())
        db.add(fs)

    log_action(db, action="update", entity_type="fine_schedule", entity_id=bylaw_id,
               changes=body.model_dump(mode="json"),
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    db.refresh(fs)
    return fs


@router.delete("/{bylaw_id}/fine-schedules/{schedule_id}",
               status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_csrf)])
def delete_fine_schedule(
    bylaw_id: int,
    schedule_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    fs = db.execute(
        select(FineSchedule)
        .where(FineSchedule.id == schedule_id)
        .where(FineSchedule.bylaw_id == bylaw_id)
    ).scalar_one_or_none()
    if not fs:
        raise HTTPException(status_code=404, detail="Fine schedule entry not found")

    log_action(db, action="delete", entity_type="fine_schedule", entity_id=schedule_id,
               changes={"bylaw_id": bylaw_id},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.delete(fs)
    db.commit()
