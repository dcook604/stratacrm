"""Lots and lot-assignment CRUD router."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.audit import log_action
from app.database import get_db
from app.dependencies import get_current_user, require_csrf, require_write
from app.models import Lot, LotAssignment, Party, User
from app.schemas.lots import (
    AssignmentDetail,
    LotAssignmentCreate,
    LotAssignmentUpdate,
    LotListItem,
    LotOut,
    LotUpdate,
    PaginatedLots,
    PartyMini,
)

router = APIRouter(prefix="/lots", tags=["lots"])


def _load_lot(lot_id: int, db: Session) -> Lot:
    lot = db.execute(
        select(Lot)
        .where(Lot.id == lot_id)
        .options(
            selectinload(Lot.assignments)
            .selectinload(LotAssignment.party)
            .selectinload(Party.contact_methods)
        )
    ).scalar_one_or_none()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    return lot


@router.get("", response_model=PaginatedLots)
def list_lots(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    search: Optional[str] = Query(None, description="Filter by unit number or SL#"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=250),
):
    stmt = (
        select(Lot)
        .options(
            selectinload(Lot.assignments).selectinload(LotAssignment.party)
        )
    )

    if search:
        try:
            sl_num = int(search)
            stmt = stmt.where(Lot.strata_lot_number == sl_num)
        except ValueError:
            stmt = stmt.where(Lot.unit_number.ilike(f"%{search}%"))

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar() or 0

    lots = db.execute(
        stmt.order_by(Lot.strata_lot_number).offset(skip).limit(limit)
    ).scalars().all()

    items = []
    for lot in lots:
        current = [a for a in lot.assignments if a.is_current]
        owner_roles = {"owner_occupant", "owner_absentee"}
        tenant_roles = {"tenant"}
        items.append(LotListItem(
            id=lot.id,
            strata_lot_number=lot.strata_lot_number,
            unit_number=lot.unit_number,
            square_feet=lot.square_feet,
            owners=[a.party.full_name for a in current if a.role.value in owner_roles],
            tenants=[a.party.full_name for a in current if a.role.value in tenant_roles],
        ))

    return PaginatedLots(items=items, total=total, skip=skip, limit=limit)


@router.get("/{lot_id}", response_model=LotOut)
def get_lot(
    lot_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    lot = _load_lot(lot_id, db)
    out = LotOut.model_validate(lot)
    out.current_assignments = [
        AssignmentDetail(
            id=a.id,
            party=PartyMini.model_validate(a.party),
            role=a.role,
            start_date=a.start_date,
            end_date=a.end_date,
            is_current=a.is_current,
            form_k_filed_date=a.form_k_filed_date,
            notes=a.notes,
        )
        for a in lot.assignments
        if a.is_current
    ]
    return out


@router.put("/{lot_id}", response_model=LotOut, dependencies=[Depends(require_csrf)])
def update_lot(
    lot_id: int,
    request: Request,
    body: LotUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    lot = db.get(Lot, lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    before = {k: str(getattr(lot, k)) for k in body.model_dump(exclude_unset=True)}
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(lot, field, value)

    log_action(db, action="update", entity_type="lot", entity_id=lot_id,
               changes={"before": before, "after": body.model_dump(exclude_unset=True)},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()

    return get_lot(lot_id, db=db, _=current_user)


# ---------------------------------------------------------------------------
# Lot assignments sub-resource
# ---------------------------------------------------------------------------

@router.post("/{lot_id}/assignments", response_model=AssignmentDetail,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
def create_assignment(
    lot_id: int,
    request: Request,
    body: LotAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    lot = db.get(Lot, lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    party = db.get(Party, body.party_id)
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")

    assignment = LotAssignment(
        lot_id=lot_id,
        party_id=body.party_id,
        role=body.role,
        start_date=body.start_date,
        end_date=body.end_date,
        form_k_filed_date=body.form_k_filed_date,
        is_current=True,
        notes=body.notes,
    )
    db.add(assignment)
    log_action(db, action="create", entity_type="lot_assignment", entity_id=None,
               changes={"lot_id": lot_id, "party_id": body.party_id, "role": body.role.value},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    db.refresh(assignment)

    # Re-fetch with party loaded
    a = db.execute(
        select(LotAssignment)
        .where(LotAssignment.id == assignment.id)
        .options(selectinload(LotAssignment.party))
    ).scalar_one()

    return AssignmentDetail(
        id=a.id,
        party=PartyMini.model_validate(a.party),
        role=a.role,
        start_date=a.start_date,
        end_date=a.end_date,
        is_current=a.is_current,
        form_k_filed_date=a.form_k_filed_date,
        notes=a.notes,
    )


@router.put("/{lot_id}/assignments/{assignment_id}", response_model=AssignmentDetail,
            dependencies=[Depends(require_csrf)])
def update_assignment(
    lot_id: int,
    assignment_id: int,
    request: Request,
    body: LotAssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    a = db.execute(
        select(LotAssignment)
        .where(LotAssignment.id == assignment_id)
        .where(LotAssignment.lot_id == lot_id)
        .options(selectinload(LotAssignment.party))
    ).scalar_one_or_none()

    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(a, field, value)

    log_action(db, action="update", entity_type="lot_assignment", entity_id=assignment_id,
               changes=body.model_dump(exclude_unset=True),
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    db.refresh(a)

    return AssignmentDetail(
        id=a.id,
        party=PartyMini.model_validate(a.party),
        role=a.role,
        start_date=a.start_date,
        end_date=a.end_date,
        is_current=a.is_current,
        form_k_filed_date=a.form_k_filed_date,
        notes=a.notes,
    )


@router.delete("/{lot_id}/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_csrf)])
def delete_assignment(
    lot_id: int,
    assignment_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    a = db.execute(
        select(LotAssignment)
        .where(LotAssignment.id == assignment_id)
        .where(LotAssignment.lot_id == lot_id)
    ).scalar_one_or_none()

    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")

    log_action(db, action="delete", entity_type="lot_assignment", entity_id=assignment_id,
               changes={"lot_id": lot_id, "party_id": a.party_id},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.delete(a)
    db.commit()
