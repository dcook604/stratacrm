"""Dashboard stats and audit log endpoints.

Extracted from main.py to follow the same router pattern as every other route group.
"""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    AuditLog,
    Incident,
    IncidentStatus,
    Infraction,
    InfractionEvent,
    InfractionEventType,
    InfractionStatus,
    Issue,
    IssueStatus,
    Lot,
    Party,
    User,
)
from app.schemas.audit import AuditLogEntry, AuditLogResponse

router = APIRouter(tags=["dashboard"])


_OPEN_INFRACTION_STATUSES = [
    InfractionStatus.open,
    InfractionStatus.notice_sent,
    InfractionStatus.response_received,
    InfractionStatus.hearing_scheduled,
]
_OPEN_INCIDENT_STATUSES = [IncidentStatus.open, IncidentStatus.in_progress]
_OPEN_ISSUE_STATUSES = [IssueStatus.open, IssueStatus.in_progress]


@router.get("/dashboard/stats")
def dashboard_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    # Single round-trip for all 5 stat counts using scalar subqueries
    counts = db.execute(
        select(
            select(func.count()).select_from(Lot)
            .scalar_subquery().label("lot_count"),
            select(func.count()).select_from(Party)
            .scalar_subquery().label("party_count"),
            select(func.count()).select_from(Infraction)
            .where(Infraction.status.in_(_OPEN_INFRACTION_STATUSES))
            .scalar_subquery().label("open_infractions"),
            select(func.count()).select_from(Incident)
            .where(Incident.status.in_(_OPEN_INCIDENT_STATUSES))
            .scalar_subquery().label("open_incidents"),
            select(func.count()).select_from(Issue)
            .where(Issue.status.in_(_OPEN_ISSUE_STATUSES))
            .scalar_subquery().label("open_issues"),
        )
    ).one()

    lot_count = counts.lot_count or 0
    party_count = counts.party_count or 0
    open_infractions = counts.open_infractions or 0
    open_incidents = counts.open_incidents or 0
    open_issues = counts.open_issues or 0

    # "Needs Attention" — overdue notice infractions
    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=14)
    overdue_notice_infs = db.execute(
        select(Infraction)
        .join(InfractionEvent, InfractionEvent.infraction_id == Infraction.id)
        .where(Infraction.status == InfractionStatus.notice_sent)
        .where(InfractionEvent.event_type == InfractionEventType.notice_sent)
        .where(InfractionEvent.occurred_at < cutoff_dt)
        .options(selectinload(Infraction.lot), selectinload(Infraction.primary_party))
        .distinct()
        .limit(10)
    ).scalars().all()

    # "Needs Attention" — overdue issues
    overdue_issues = db.execute(
        select(Issue)
        .where(Issue.due_date < date.today())
        .where(Issue.status.in_([IssueStatus.open, IssueStatus.in_progress]))
        .options(selectinload(Issue.assignee))
        .order_by(Issue.due_date.asc())
        .limit(10)
    ).scalars().all()

    recent_audit = db.execute(
        select(AuditLog)
        .order_by(AuditLog.occurred_at.desc())
        .limit(5)
    ).scalars().all()

    user_ids = {e.entity_id for e in recent_audit if e.entity_type == "user" and e.entity_id}
    user_names = {}
    if user_ids:
        users = db.execute(select(User).where(User.id.in_(user_ids))).scalars().all()
        user_names = {u.id: u.full_name for u in users}

    return {
        "lot_count": lot_count,
        "party_count": party_count,
        "open_infractions": open_infractions,
        "open_incidents": open_incidents,
        "open_issues": open_issues,
        "overdue_notice_infractions": [
            {
                "id": i.id,
                "lot_number": i.lot.strata_lot_number if i.lot else None,
                "unit_number": i.lot.unit_number if i.lot else None,
                "party_name": i.primary_party.full_name if i.primary_party else None,
            }
            for i in overdue_notice_infs
        ],
        "overdue_issues": [
            {
                "id": i.id,
                "title": i.title,
                "due_date": i.due_date.isoformat() if i.due_date else None,
                "priority": i.priority.value,
                "assignee_email": i.assignee.email if i.assignee else None,
            }
            for i in overdue_issues
        ],
        "recent_audit": [
            {
                "id": e.id,
                "actor_email": e.actor_email,
                "action": e.action,
                "entity_type": e.entity_type,
                "entity_id": e.entity_id,
                "entity_name": user_names.get(e.entity_id) if e.entity_type == "user" else None,
                "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None,
            }
            for e in recent_audit
        ],
    }


@router.get("/audit-log")
def get_audit_log(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    action: str = Query(None, description="Filter by action type"),
    entity_type: str = Query(None, description="Filter by entity type"),
):
    query = select(AuditLog)

    if action:
        query = query.where(AuditLog.action == action)
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)

    count_query = select(func.count()).select_from(query.subquery())
    total = db.execute(count_query).scalar() or 0

    entries = db.execute(
        query.order_by(AuditLog.occurred_at.desc()).offset(skip).limit(limit)
    ).scalars().all()

    user_ids = {e.entity_id for e in entries if e.entity_type == "user" and e.entity_id}
    user_names = {}
    if user_ids:
        users = db.execute(select(User).where(User.id.in_(user_ids))).scalars().all()
        user_names = {u.id: u.full_name for u in users}

    return AuditLogResponse(
        items=[
            AuditLogEntry(
                id=e.id,
                actor_email=e.actor_email,
                action=e.action,
                entity_type=e.entity_type,
                entity_id=e.entity_id,
                entity_name=user_names.get(e.entity_id) if e.entity_type == "user" else None,
                changes=e.changes,
                occurred_at=e.occurred_at.isoformat() if e.occurred_at else None,
                ip_address=e.ip_address,
            )
            for e in entries
        ],
        total=total,
        skip=skip,
        limit=limit,
    )
