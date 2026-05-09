"""Email ingest — config management, Gmail OAuth2 flow, manual poll trigger."""

import json
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, get_db
from app.dependencies import get_current_user, require_write
from app.models import EmailIngestConfig, User
from app.services.email_ingest import (
    build_oauth_flow,
    fetch_gmail_address,
    poll_gmail,
)

router = APIRouter(prefix="/email-ingest", tags=["email-ingest"])

_OAUTH_REDIRECT_PATH = "/api/email-ingest/oauth/callback"


def _get_config(db: Session) -> EmailIngestConfig:
    config = db.get(EmailIngestConfig, 1)
    if not config:
        raise HTTPException(status_code=500, detail="Email ingest config missing — run migrations")
    return config


def _redirect_uri() -> str:
    return settings.app_base_url.rstrip("/") + _OAUTH_REDIRECT_PATH


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class EmailIngestConfigOut(BaseModel):
    enabled: bool
    ai_provider: str
    has_anthropic_key: bool
    has_deepseek_key: bool
    gmail_poll_label: str
    gmail_poll_interval_minutes: int
    gmail_connected_email: Optional[str]
    last_polled_at: Optional[str]
    last_poll_stats: Optional[dict]
    has_gmail_credentials: bool
    has_gmail_token: bool


class EmailIngestConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    ai_provider: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    deepseek_api_key: Optional[str] = None
    gmail_poll_label: Optional[str] = None
    gmail_poll_interval_minutes: Optional[int] = None
    gmail_credentials_json: Optional[str] = None


class PollResult(BaseModel):
    created: int
    skipped: int
    errors: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/config", response_model=EmailIngestConfigOut)
def get_config(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    config = _get_config(db)
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
        gmail_poll_label=config.gmail_poll_label,
        gmail_poll_interval_minutes=config.gmail_poll_interval_minutes,
        gmail_connected_email=config.gmail_connected_email,
        last_polled_at=config.last_polled_at.isoformat() if config.last_polled_at else None,
        last_poll_stats=stats,
        has_gmail_credentials=bool(config.gmail_credentials_json),
        has_gmail_token=bool(config.gmail_token_json),
    )


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
    if body.gmail_poll_label is not None:
        config.gmail_poll_label = body.gmail_poll_label or "CRM-Inbound"
    if body.gmail_poll_interval_minutes is not None:
        config.gmail_poll_interval_minutes = max(1, body.gmail_poll_interval_minutes)
    if body.gmail_credentials_json is not None:
        # Validate JSON before saving
        try:
            json.loads(body.gmail_credentials_json)
        except json.JSONDecodeError:
            raise HTTPException(status_code=422, detail="gmail_credentials_json is not valid JSON")
        config.gmail_credentials_json = body.gmail_credentials_json
        # Clear token when credentials change — require re-auth
        config.gmail_token_json = None
        config.gmail_connected_email = None

    db.commit()
    db.refresh(config)
    return get_config(db)


@router.delete("/config/gmail")
def disconnect_gmail(
    db: Session = Depends(get_db),
    _: User = Depends(require_write),
):
    """Revoke Gmail connection by clearing stored token."""
    config = _get_config(db)
    config.gmail_token_json = None
    config.gmail_connected_email = None
    config.enabled = False
    db.commit()
    return {"status": "disconnected"}


# ---------------------------------------------------------------------------
# OAuth2 flow
# ---------------------------------------------------------------------------

@router.get("/oauth/start")
def oauth_start(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_write),
):
    """Generate the Google OAuth2 authorization URL."""
    config = _get_config(db)
    if not config.gmail_credentials_json:
        raise HTTPException(
            status_code=400,
            detail="Gmail credentials not configured. Paste your client_secrets.json content first.",
        )
    try:
        flow = build_oauth_flow(config.gmail_credentials_json, _redirect_uri())
        auth_url, state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to build OAuth URL: {exc}")

    request.session["gmail_oauth_state"] = state
    return {"auth_url": auth_url}


@router.get("/oauth/callback")
def oauth_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Handle Google OAuth2 callback, exchange code for token, save to DB."""
    frontend_base = settings.app_base_url.replace("/api", "").rstrip("/")
    settings_url = f"{frontend_base}/settings/email-ingest"

    if error:
        return RedirectResponse(url=f"{settings_url}?error={error}")

    saved_state = request.session.get("gmail_oauth_state")
    if not saved_state or saved_state != state:
        return RedirectResponse(url=f"{settings_url}?error=invalid_state")

    config = _get_config(db)
    if not config.gmail_credentials_json:
        return RedirectResponse(url=f"{settings_url}?error=no_credentials")

    try:
        flow = build_oauth_flow(config.gmail_credentials_json, _redirect_uri())
        flow.fetch_token(code=code)
        creds = flow.credentials
        token_json = json.dumps({
            "token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "scopes": list(creds.scopes),
        })
        config.gmail_token_json = token_json
        connected_email = fetch_gmail_address(token_json)
        config.gmail_connected_email = connected_email
        db.commit()
    except Exception as exc:
        return RedirectResponse(url=f"{settings_url}?error=token_exchange_failed")

    request.session.pop("gmail_oauth_state", None)
    return RedirectResponse(url=f"{settings_url}?connected=1")


# ---------------------------------------------------------------------------
# Manual poll trigger
# ---------------------------------------------------------------------------

def _run_poll_task():
    db = SessionLocal()
    try:
        poll_gmail(db)
    finally:
        db.close()


@router.post("/poll")
def trigger_poll(
    background_tasks: BackgroundTasks,
    _: User = Depends(require_write),
):
    """Manually trigger a Gmail poll (runs in background)."""
    background_tasks.add_task(_run_poll_task)
    return {"status": "polling started"}
