"""Email ingest — IMAP config management, connection test, manual poll trigger."""

import json
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.dependencies import get_current_user, require_write
from app.models import EmailIngestConfig, User
from app.services.email_ingest import poll_imap, test_imap_connection

router = APIRouter(prefix="/email-ingest", tags=["email-ingest"])


def _get_config(db: Session) -> EmailIngestConfig:
    config = db.get(EmailIngestConfig, 1)
    if not config:
        raise HTTPException(status_code=500, detail="Email ingest config missing — run migrations")
    return config


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class EmailIngestConfigOut(BaseModel):
    enabled: bool
    ai_provider: str
    has_anthropic_key: bool
    has_deepseek_key: bool
    poll_interval_minutes: int
    allowed_senders: Optional[str]
    imap_host: Optional[str]
    imap_port: Optional[int]
    imap_username: Optional[str]
    imap_use_ssl: bool
    imap_mailbox: str
    has_imap_password: bool
    imap_configured: bool
    last_polled_at: Optional[str]
    last_poll_stats: Optional[dict]


class EmailIngestConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    ai_provider: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    deepseek_api_key: Optional[str] = None
    poll_interval_minutes: Optional[int] = None
    allowed_senders: Optional[str] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    imap_username: Optional[str] = None
    imap_password: Optional[str] = None
    imap_use_ssl: Optional[bool] = None
    imap_mailbox: Optional[str] = None


class PollResult(BaseModel):
    created: int
    skipped: int
    errors: int
    pending: int
    appended: int = 0


class TestResult(BaseModel):
    ok: bool
    error: Optional[str]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def _config_out(config: EmailIngestConfig, db: Session) -> EmailIngestConfigOut:
    stats = None
    if config.last_poll_stats:
        try:
            stats = json.loads(config.last_poll_stats)
        except json.JSONDecodeError:
            pass
    return EmailIngestConfigOut(
        enabled=config.enabled,
        ai_provider=config.ai_provider,
        has_anthropic_key=bool(config.anthropic_api_key),
        has_deepseek_key=bool(config.deepseek_api_key),
        poll_interval_minutes=config.poll_interval_minutes,
        imap_host=config.imap_host,
        imap_port=config.imap_port,
        imap_username=config.imap_username,
        imap_use_ssl=config.imap_use_ssl,
        imap_mailbox=config.imap_mailbox or "INBOX",
        has_imap_password=bool(config.imap_password),
        allowed_senders=config.allowed_senders or None,
        imap_configured=bool(config.imap_host and config.imap_username and config.imap_password),
        last_polled_at=config.last_polled_at.isoformat() if config.last_polled_at else None,
        last_poll_stats=stats,
    )


@router.get("/config", response_model=EmailIngestConfigOut)
def get_config(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return _config_out(_get_config(db), db)


@router.patch("/config", response_model=EmailIngestConfigOut)
def update_config(
    body: EmailIngestConfigUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_write),
):
    config = _get_config(db)

    if body.enabled is not None:
        config.enabled = body.enabled
    if body.ai_provider is not None:
        if body.ai_provider not in ("anthropic", "deepseek"):
            raise HTTPException(status_code=422, detail="ai_provider must be 'anthropic' or 'deepseek'")
        config.ai_provider = body.ai_provider
    if body.anthropic_api_key is not None:
        config.anthropic_api_key = body.anthropic_api_key or None
    if body.deepseek_api_key is not None:
        config.deepseek_api_key = body.deepseek_api_key or None
    if body.poll_interval_minutes is not None:
        config.poll_interval_minutes = max(1, body.poll_interval_minutes)
    if body.imap_host is not None:
        config.imap_host = body.imap_host or None
    if body.imap_port is not None:
        config.imap_port = body.imap_port or None
    if body.imap_username is not None:
        config.imap_username = body.imap_username or None
    if body.imap_password is not None:
        config.imap_password = body.imap_password or None
    if body.imap_use_ssl is not None:
        config.imap_use_ssl = body.imap_use_ssl
    if body.imap_mailbox is not None:
        config.imap_mailbox = body.imap_mailbox or "INBOX"
    if body.allowed_senders is not None:
        config.allowed_senders = body.allowed_senders.strip() or None

    db.commit()
    db.refresh(config)
    return _config_out(config, db)


@router.delete("/config/imap")
def disconnect_imap(
    db: Session = Depends(get_db),
    _: User = Depends(require_write),
):
    """Clear IMAP credentials and disable polling."""
    config = _get_config(db)
    config.imap_host = None
    config.imap_port = None
    config.imap_username = None
    config.imap_password = None
    config.enabled = False
    db.commit()
    return {"status": "disconnected"}


@router.post("/test", response_model=TestResult)
def test_connection(
    db: Session = Depends(get_db),
    _: User = Depends(require_write),
):
    """Attempt an IMAP login and return success/error."""
    config = _get_config(db)
    result = test_imap_connection(config)
    return TestResult(**result)


# ---------------------------------------------------------------------------
# Manual poll trigger
# ---------------------------------------------------------------------------

def _run_poll_task():
    db = SessionLocal()
    try:
        poll_imap(db)
    finally:
        db.close()


@router.post("/poll")
def trigger_poll(
    background_tasks: BackgroundTasks,
    _: User = Depends(require_write),
):
    """Manually trigger an IMAP poll (runs in background)."""
    background_tasks.add_task(_run_poll_task)
    return {"status": "polling started"}
