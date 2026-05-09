"""Gmail polling + AI parsing → Issue creation.

All configuration is loaded from the EmailIngestConfig DB row (id=1).
Supported AI providers: Anthropic Claude, DeepSeek (OpenAI-compatible API).

Gmail OAuth2 setup:
  1. Create a Google Cloud project, enable Gmail API, create OAuth2 credentials.
  2. In the CRM web UI go to Settings → Email Ingest.
  3. Paste the client_secrets.json content, click "Authorize Gmail".
  4. Complete the Google consent screen — the token is saved automatically.
"""

import base64
import json
import re
import structlog
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import select

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# Gmail helpers
# ---------------------------------------------------------------------------

def _build_credentials(config):
    """Build Google OAuth2 Credentials from the stored token JSON."""
    from google.oauth2.credentials import Credentials
    token_data = json.loads(config.gmail_token_json)
    return Credentials(
        token=token_data.get("token"),
        refresh_token=token_data.get("refresh_token"),
        token_uri=token_data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=token_data.get("client_id"),
        client_secret=token_data.get("client_secret"),
        scopes=token_data.get("scopes", ["https://www.googleapis.com/auth/gmail.modify"]),
    )


def _get_gmail_service(config, db: Session):
    """Return an authenticated Gmail service, refreshing the token if needed."""
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    from app.models import EmailIngestConfig

    creds = _build_credentials(config)

    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        updated_token = json.dumps({
            "token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "scopes": list(creds.scopes),
        })
        db.execute(
            select(EmailIngestConfig).where(EmailIngestConfig.id == 1)
        )
        cfg = db.get(EmailIngestConfig, 1)
        if cfg:
            cfg.gmail_token_json = updated_token
            db.commit()

    return build("gmail", "v1", credentials=creds)


def _get_or_create_label(service, label_name: str) -> Optional[str]:
    try:
        labels = service.users().labels().list(userId="me").execute()
        for label in labels.get("labels", []):
            if label["name"] == label_name:
                return label["id"]
        result = service.users().labels().create(
            userId="me",
            body={
                "name": label_name,
                "labelListVisibility": "labelShow",
                "messageListVisibility": "show",
            },
        ).execute()
        return result["id"]
    except Exception as exc:
        log.warning("gmail_label_create_failed", label=label_name, error=str(exc))
        return None


def _extract_plain_text(payload: dict) -> str:
    """Recursively extract plain text from a Gmail message payload."""
    mime = payload.get("mimeType", "")

    if mime == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")

    for part in payload.get("parts", []):
        text = _extract_plain_text(part)
        if text:
            return text

    if mime == "text/html":
        data = payload.get("body", {}).get("data", "")
        if data:
            html = base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
            return re.sub(r"<[^>]+>", " ", html)

    return ""


def _get_header(headers: list, name: str) -> str:
    for h in headers:
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def _parse_sender(from_header: str) -> tuple[str, str]:
    match = re.match(r'^"?([^"<]+?)"?\s*<([^>]+)>', from_header.strip())
    if match:
        return match.group(1).strip(), match.group(2).strip()
    email = from_header.strip().strip("<>")
    return "", email


# ---------------------------------------------------------------------------
# AI parsing
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = (
    "You are a data extraction assistant for a strata (condo) property management CRM. "
    "Extract structured issue data from resident or staff emails. "
    "Return ONLY a JSON object — no markdown, no explanation."
)

_USER_PROMPT = """\
Extract a structured issue from this email and return a JSON object with these fields:
- title: string (max 200 chars, clear action-oriented summary)
- description: string (preserve all relevant details and context)
- priority: one of "low" | "medium" | "high" | "urgent"
- unit_number: string or null (strata unit/lot number if mentioned, e.g. "304", "1A")

Priority guide:
  urgent — safety hazard, flooding, fire, gas leak, security breach
  high   — significant damage, broken elevator, no hot water, pest infestation
  medium — maintenance needed, noise complaint, parking violation
  low    — general inquiry, suggestion, minor cosmetic issue

Email:
From: {sender}
Subject: {subject}

{body}"""


def _parse_ai_json(text: str) -> dict:
    text = re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("`").strip()
    try:
        data = json.loads(text)
        priority = data.get("priority", "medium")
        if priority not in ("low", "medium", "high", "urgent"):
            priority = "medium"
        return {
            "title": str(data.get("title", "Issue reported via email"))[:300],
            "description": str(data.get("description", "")),
            "priority": priority,
            "unit_number": data.get("unit_number"),
        }
    except (json.JSONDecodeError, TypeError):
        log.warning("ai_parse_json_failed", preview=text[:200])
        return {
            "title": "Issue reported via email",
            "description": text,
            "priority": "medium",
            "unit_number": None,
        }


def _parse_with_anthropic(subject: str, body: str, sender: str, api_key: str) -> dict:
    import anthropic
    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": _USER_PROMPT.format(
            sender=sender, subject=subject, body=body[:3000]
        )}],
    )
    return _parse_ai_json(response.content[0].text)


def _parse_with_deepseek(subject: str, body: str, sender: str, api_key: str) -> dict:
    from openai import OpenAI
    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
    response = client.chat.completions.create(
        model="deepseek-chat",
        max_tokens=512,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": _USER_PROMPT.format(
                sender=sender, subject=subject, body=body[:3000]
            )},
        ],
    )
    return _parse_ai_json(response.choices[0].message.content or "")


def parse_email_with_ai(subject: str, body: str, sender: str, config) -> dict:
    if config.ai_provider == "deepseek":
        if not config.deepseek_api_key:
            raise RuntimeError("DeepSeek API key not configured")
        return _parse_with_deepseek(subject, body, sender, config.deepseek_api_key)
    if not config.anthropic_api_key:
        raise RuntimeError("Anthropic API key not configured")
    return _parse_with_anthropic(subject, body, sender, config.anthropic_api_key)


# ---------------------------------------------------------------------------
# Lot lookup
# ---------------------------------------------------------------------------

def _find_lot_id(db: Session, unit_number: Optional[str]) -> Optional[int]:
    if not unit_number:
        return None
    from app.models import Lot

    lot = db.execute(
        select(Lot).where(Lot.unit_number == unit_number.strip())
    ).scalar_one_or_none()
    if lot:
        return lot.id

    try:
        lot_num = int(unit_number.strip())
        lot = db.execute(
            select(Lot).where(Lot.strata_lot_number == lot_num)
        ).scalar_one_or_none()
        if lot:
            return lot.id
    except ValueError:
        pass

    return None


# ---------------------------------------------------------------------------
# OAuth2 helpers (used by the router)
# ---------------------------------------------------------------------------

def build_oauth_flow(credentials_json: str, redirect_uri: str):
    """Build a google_auth_oauthlib Flow from client_secrets JSON string."""
    from google_auth_oauthlib.flow import Flow
    client_config = json.loads(credentials_json)
    # Support both "web" and "installed" credential types
    app_type = "web" if "web" in client_config else "installed"
    return Flow.from_client_config(
        client_config,
        scopes=["https://www.googleapis.com/auth/gmail.modify"],
        redirect_uri=redirect_uri,
    )


def fetch_gmail_address(token_json: str) -> Optional[str]:
    """Return the Gmail address for the stored token."""
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        token_data = json.loads(token_json)
        creds = Credentials(
            token=token_data.get("token"),
            refresh_token=token_data.get("refresh_token"),
            token_uri=token_data.get("token_uri", "https://oauth2.googleapis.com/token"),
            client_id=token_data.get("client_id"),
            client_secret=token_data.get("client_secret"),
            scopes=token_data.get("scopes"),
        )
        service = build("gmail", "v1", credentials=creds)
        profile = service.users().getProfile(userId="me").execute()
        return profile.get("emailAddress")
    except Exception as exc:
        log.warning("fetch_gmail_address_failed", error=str(exc))
        return None


# ---------------------------------------------------------------------------
# Main poll function
# ---------------------------------------------------------------------------

def poll_gmail(db: Session) -> dict:
    """Load config from DB, poll Gmail, create issues. Returns stats dict."""
    from app.models import EmailIngestConfig, Issue, IssuePriority, IssueStatus

    config = db.get(EmailIngestConfig, 1)
    if not config or not config.enabled or not config.gmail_token_json:
        return {"created": 0, "skipped": 0, "errors": 0, "skipped_reason": "not configured or disabled"}

    stats = {"created": 0, "skipped": 0, "errors": 0}

    try:
        service = _get_gmail_service(config, db)
    except Exception as exc:
        log.error("gmail_init_failed", error=str(exc))
        _save_poll_stats(db, stats)
        return stats

    processed_label_id = _get_or_create_label(service, "CRM-Processed")

    try:
        query = f"label:{config.gmail_poll_label} is:unread"
        result = service.users().messages().list(userId="me", q=query, maxResults=50).execute()
        messages = result.get("messages", [])
    except Exception as exc:
        log.error("gmail_list_failed", error=str(exc))
        _save_poll_stats(db, stats)
        return stats

    for msg_ref in messages:
        msg_id = msg_ref["id"]

        existing = db.execute(
            select(Issue).where(Issue.gmail_message_id == msg_id)
        ).scalar_one_or_none()
        if existing:
            stats["skipped"] += 1
            _mark_processed(service, msg_id, processed_label_id)
            continue

        try:
            msg = service.users().messages().get(userId="me", id=msg_id, format="full").execute()
            headers = msg["payload"].get("headers", [])
            subject = _get_header(headers, "Subject") or "(No subject)"
            sender = _get_header(headers, "From") or ""
            body = _extract_plain_text(msg["payload"])

            reporter_name, reporter_email = _parse_sender(sender)
            parsed = parse_email_with_ai(subject, body, sender, config)
            lot_id = _find_lot_id(db, parsed.get("unit_number"))

            issue = Issue(
                title=parsed["title"],
                description=f"**From:** {sender}\n**Subject:** {subject}\n\n{parsed['description']}",
                priority=IssuePriority(parsed["priority"]),
                status=IssueStatus.open,
                source="email",
                reporter_email=reporter_email or None,
                reporter_name=reporter_name or None,
                gmail_message_id=msg_id,
                related_lot_id=lot_id,
            )
            db.add(issue)
            db.commit()
            stats["created"] += 1
            _mark_processed(service, msg_id, processed_label_id)
            log.info("email_issue_created", gmail_id=msg_id, title=parsed["title"])

        except Exception as exc:
            log.error("email_ingest_message_failed", gmail_id=msg_id, error=str(exc))
            db.rollback()
            stats["errors"] += 1

    _save_poll_stats(db, stats)
    log.info("gmail_poll_complete", **stats)
    return stats


def _mark_processed(service, msg_id: str, processed_label_id: Optional[str]) -> None:
    try:
        body: dict = {"removeLabelIds": ["UNREAD"]}
        if processed_label_id:
            body["addLabelIds"] = [processed_label_id]
        service.users().messages().modify(userId="me", id=msg_id, body=body).execute()
    except Exception as exc:
        log.warning("gmail_mark_processed_failed", gmail_id=msg_id, error=str(exc))


def _save_poll_stats(db: Session, stats: dict) -> None:
    from app.models import EmailIngestConfig
    try:
        cfg = db.get(EmailIngestConfig, 1)
        if cfg:
            cfg.last_polled_at = datetime.now(timezone.utc)
            cfg.last_poll_stats = json.dumps(stats)
            db.commit()
    except Exception:
        db.rollback()


# ---------------------------------------------------------------------------
# Scheduler tick — called every minute by APScheduler
# ---------------------------------------------------------------------------

def scheduler_tick(db: Session) -> None:
    """Check if it's time to poll and do so if needed."""
    from app.models import EmailIngestConfig

    config = db.get(EmailIngestConfig, 1)
    if not config or not config.enabled or not config.gmail_token_json:
        return

    now = datetime.now(timezone.utc)
    if config.last_polled_at:
        elapsed = now - config.last_polled_at.replace(tzinfo=timezone.utc)
        interval = timedelta(minutes=max(1, config.gmail_poll_interval_minutes))
        if elapsed < interval:
            return

    poll_gmail(db)
