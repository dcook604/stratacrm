from datetime import datetime, timezone
from typing import Any, Optional
from sqlalchemy.orm import Session
from fastapi import Request


def log_action(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: Optional[int] = None,
    changes: Optional[dict] = None,
    actor_id: Optional[int] = None,
    actor_email: Optional[str] = None,
    request: Optional[Request] = None,
) -> None:
    """Append one row to audit_log. Caller must commit the session."""
    from app.models import AuditLog

    ip_address: Optional[str] = None
    if request:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            ip_address = forwarded.split(",")[0].strip()
        elif request.client:
            ip_address = request.client.host

    entry = AuditLog(
        actor_id=actor_id,
        actor_email=actor_email,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        changes=changes,
        occurred_at=datetime.now(timezone.utc),
        ip_address=ip_address,
    )
    db.add(entry)
