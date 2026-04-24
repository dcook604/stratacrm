from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AuditLogEntry(BaseModel):
    id: int
    actor_email: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    changes: Optional[dict] = None
    occurred_at: Optional[str] = None
    ip_address: Optional[str] = None

    model_config = {"from_attributes": True}


class AuditLogResponse(BaseModel):
    items: list[AuditLogEntry]
    total: int
    skip: int
    limit: int
