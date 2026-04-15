"""Parties CRUD router."""

from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.audit import log_action
from app.database import get_db
from app.dependencies import get_current_user, require_csrf, require_write
from app.models import (
    ContactMethod, ContactMethodType, LotAssignment, Party, User
)
from app.schemas.parties import (
    AssignmentOut,
    ContactMethodCreate,
    ContactMethodOut,
    ContactMethodUpdate,
    PaginatedParties,
    PartyCreate,
    PartyListItem,
    PartyOut,
    PartyUpdate,
)

router = APIRouter(prefix="/parties", tags=["parties"])


def _primary_contact(party: Party, method_type: ContactMethodType) -> Optional[str]:
    for cm in party.contact_methods:
        if cm.method_type == method_type and cm.is_primary:
            return cm.value
    for cm in party.contact_methods:
        if cm.method_type == method_type:
            return cm.value
    return None


@router.get("", response_model=PaginatedParties)
def list_parties(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    search: Optional[str] = Query(None),
    party_type: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    stmt = (
        select(Party)
        .options(
            selectinload(Party.contact_methods),
            selectinload(Party.assignments).selectinload(LotAssignment.lot),
        )
    )

    if search:
        stmt = stmt.where(Party.full_name.ilike(f"%{search}%"))
    if party_type:
        stmt = stmt.where(Party.party_type == party_type)

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar() or 0

    parties = db.execute(
        stmt.order_by(Party.full_name).offset(skip).limit(limit)
    ).scalars().all()

    items = []
    for p in parties:
        current_lots = [a.lot_id for a in p.assignments if a.is_current]
        items.append(PartyListItem(
            id=p.id,
            party_type=p.party_type,
            full_name=p.full_name,
            is_property_manager=p.is_property_manager,
            primary_email=_primary_contact(p, ContactMethodType.email),
            primary_phone=(
                _primary_contact(p, ContactMethodType.cell_phone)
                or _primary_contact(p, ContactMethodType.home_phone)
                or _primary_contact(p, ContactMethodType.work_phone)
            ),
            lot_count=len(set(current_lots)),
        ))

    return PaginatedParties(items=items, total=total, skip=skip, limit=limit)


@router.get("/{party_id}", response_model=PartyOut)
def get_party(
    party_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    party = db.execute(
        select(Party)
        .where(Party.id == party_id)
        .options(
            selectinload(Party.contact_methods),
            selectinload(Party.assignments)
            .selectinload(LotAssignment.lot),
        )
    ).scalar_one_or_none()

    if not party:
        raise HTTPException(status_code=404, detail="Party not found")

    out = PartyOut.model_validate(party)
    out.current_assignments = [
        AssignmentOut.model_validate(a)
        for a in party.assignments
        if a.is_current
    ]
    return out


@router.post("", response_model=PartyOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_csrf)])
def create_party(
    request: Request,
    body: PartyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    party = Party(
        party_type=body.party_type,
        full_name=body.full_name,
        is_property_manager=body.is_property_manager,
        parent_party_id=body.parent_party_id,
        mailing_address_line1=body.mailing_address_line1,
        mailing_address_line2=body.mailing_address_line2,
        mailing_city=body.mailing_city,
        mailing_province=body.mailing_province,
        mailing_postal_code=body.mailing_postal_code,
        mailing_country=body.mailing_country or "Canada",
        notes=body.notes,
    )
    db.add(party)
    db.flush()  # get party.id

    for cm_data in body.contact_methods:
        db.add(ContactMethod(
            party_id=party.id,
            method_type=cm_data.method_type,
            value=cm_data.value,
            is_primary=cm_data.is_primary,
        ))

    log_action(db, action="create", entity_type="party", entity_id=party.id,
               changes={"full_name": party.full_name},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    db.refresh(party)

    return get_party(party.id, db=db, _=current_user)


@router.put("/{party_id}", response_model=PartyOut, dependencies=[Depends(require_csrf)])
def update_party(
    party_id: int,
    request: Request,
    body: PartyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    party = db.get(Party, party_id)
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")

    before = {
        "full_name": party.full_name,
        "mailing_postal_code": party.mailing_postal_code,
    }

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(party, field, value)

    log_action(db, action="update", entity_type="party", entity_id=party_id,
               changes={"before": before, "after": body.model_dump(exclude_unset=True)},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()

    return get_party(party_id, db=db, _=current_user)


@router.delete("/{party_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_csrf)])
def delete_party(
    party_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    party = db.get(Party, party_id)
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")

    log_action(db, action="delete", entity_type="party", entity_id=party_id,
               changes={"full_name": party.full_name},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.delete(party)
    db.commit()


# ---------------------------------------------------------------------------
# Contact methods sub-resource
# ---------------------------------------------------------------------------

@router.post("/{party_id}/contact-methods", response_model=ContactMethodOut,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
def add_contact_method(
    party_id: int,
    request: Request,
    body: ContactMethodCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    party = db.get(Party, party_id)
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")

    # If new contact is primary, demote existing primaries of same type
    if body.is_primary:
        db.execute(
            select(ContactMethod)
            .where(ContactMethod.party_id == party_id)
            .where(ContactMethod.method_type == body.method_type)
            .where(ContactMethod.is_primary == True)  # noqa: E712
        )
        for existing in db.execute(
            select(ContactMethod)
            .where(ContactMethod.party_id == party_id)
            .where(ContactMethod.method_type == body.method_type)
            .where(ContactMethod.is_primary == True)  # noqa: E712
        ).scalars().all():
            existing.is_primary = False

    cm = ContactMethod(
        party_id=party_id,
        method_type=body.method_type,
        value=body.value,
        is_primary=body.is_primary,
    )
    db.add(cm)
    log_action(db, action="create", entity_type="contact_method", entity_id=None,
               changes={"party_id": party_id, "method_type": body.method_type, "value": body.value},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    db.refresh(cm)
    return ContactMethodOut.model_validate(cm)


@router.put("/{party_id}/contact-methods/{cm_id}", response_model=ContactMethodOut,
            dependencies=[Depends(require_csrf)])
def update_contact_method(
    party_id: int,
    cm_id: int,
    request: Request,
    body: ContactMethodUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    cm = db.execute(
        select(ContactMethod)
        .where(ContactMethod.id == cm_id)
        .where(ContactMethod.party_id == party_id)
    ).scalar_one_or_none()

    if not cm:
        raise HTTPException(status_code=404, detail="Contact method not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cm, field, value)

    log_action(db, action="update", entity_type="contact_method", entity_id=cm_id,
               changes=body.model_dump(exclude_unset=True),
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    db.refresh(cm)
    return ContactMethodOut.model_validate(cm)


@router.delete("/{party_id}/contact-methods/{cm_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_csrf)])
def delete_contact_method(
    party_id: int,
    cm_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    cm = db.execute(
        select(ContactMethod)
        .where(ContactMethod.id == cm_id)
        .where(ContactMethod.party_id == party_id)
    ).scalar_one_or_none()

    if not cm:
        raise HTTPException(status_code=404, detail="Contact method not found")

    log_action(db, action="delete", entity_type="contact_method", entity_id=cm_id,
               changes={"value": cm.value},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.delete(cm)
    db.commit()
