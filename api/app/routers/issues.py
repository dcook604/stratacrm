"""Issues router — maintenance and council action items."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload

from app.audit import log_action
from app.database import get_db
from app.dependencies import get_current_user, require_csrf, require_write
from app.models import Incident, Issue, IssuePriority, IssueStatus, Lot, User
from app.schemas.issues import IssueCreate, IssueOut, IssueUpdate

router = APIRouter(prefix="/issues", tags=["issues"])


def _load(issue_id: int, db: Session) -> Issue:
    issue = db.execute(
        select(Issue)
        .where(Issue.id == issue_id)
        .options(
            selectinload(Issue.assignee),
            selectinload(Issue.related_lot),
            selectinload(Issue.related_incident),
        )
    ).scalar_one_or_none()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    return issue


@router.get("", response_model=list[IssueOut])
def list_issues(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    status_filter: Optional[IssueStatus] = Query(None, alias="status"),
    priority: Optional[IssuePriority] = Query(None),
    assignee_id: Optional[int] = Query(None),
    open_only: bool = Query(False),
    overdue_only: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    stmt = (
        select(Issue)
        .options(
            selectinload(Issue.assignee),
            selectinload(Issue.related_lot),
            selectinload(Issue.related_incident),
        )
        .order_by(
            Issue.priority.desc(),
            Issue.due_date.asc().nullslast(),
            Issue.id.desc(),
        )
    )
    if status_filter:
        stmt = stmt.where(Issue.status == status_filter)
    if open_only:
        stmt = stmt.where(Issue.status.in_([IssueStatus.open, IssueStatus.in_progress]))
    if overdue_only:
        stmt = stmt.where(func.date(Issue.due_date) < date.today()).where(
            Issue.status.in_([IssueStatus.open, IssueStatus.in_progress])
        )
    if priority:
        stmt = stmt.where(Issue.priority == priority)
    if assignee_id:
        stmt = stmt.where(Issue.assignee_id == assignee_id)
    stmt = stmt.offset(skip).limit(limit)
    return db.execute(stmt).scalars().all()


@router.post("", response_model=IssueOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_csrf)])
def create_issue(
    request: Request,
    body: IssueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    if body.related_lot_id and not db.get(Lot, body.related_lot_id):
        raise HTTPException(status_code=404, detail="Lot not found")
    if body.related_incident_id and not db.get(Incident, body.related_incident_id):
        raise HTTPException(status_code=404, detail="Incident not found")
    if body.assignee_id and not db.get(User, body.assignee_id):
        raise HTTPException(status_code=404, detail="Assignee not found")

    issue = Issue(**body.model_dump())
    db.add(issue)
    log_action(db, action="create", entity_type="issue", entity_id=None,
               changes=body.model_dump(mode="json"),
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    db.refresh(issue)
    return _load(issue.id, db)


@router.get("/{issue_id}", response_model=IssueOut)
def get_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return _load(issue_id, db)


@router.patch("/{issue_id}", response_model=IssueOut,
              dependencies=[Depends(require_csrf)])
def update_issue(
    issue_id: int,
    request: Request,
    body: IssueUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    issue = db.get(Issue, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    updates = body.model_dump(exclude_unset=True)
    if updates.get("related_lot_id") and not db.get(Lot, updates["related_lot_id"]):
        raise HTTPException(status_code=404, detail="Lot not found")
    if updates.get("related_incident_id") and not db.get(Incident, updates["related_incident_id"]):
        raise HTTPException(status_code=404, detail="Incident not found")
    if updates.get("assignee_id") and not db.get(User, updates["assignee_id"]):
        raise HTTPException(status_code=404, detail="Assignee not found")

    for field, value in updates.items():
        setattr(issue, field, value)

    log_action(db, action="update", entity_type="issue", entity_id=issue_id,
               changes=body.model_dump(exclude_unset=True, mode="json"),
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    return _load(issue_id, db)


@router.delete("/{issue_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_csrf)])
def delete_issue(
    issue_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    issue = db.get(Issue, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    log_action(db, action="delete", entity_type="issue", entity_id=issue_id,
               changes={},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.delete(issue)
    db.commit()
