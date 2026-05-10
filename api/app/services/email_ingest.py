"""IMAP polling + AI parsing + regex unit extraction → Issue creation.

All configuration is loaded from the EmailIngestConfig DB row (id=1).
Supported AI providers: Anthropic Claude, DeepSeek (OpenAI-compatible API).

IMAP setup:
  1. Create a dedicated mailbox (e.g. issues@yourdomain.ca).
  2. If using Gmail, enable IMAP and generate an App Password under
     Google Account → Security → 2-Step Verification → App Passwords.
  3. In the CRM web UI go to Settings → Email Ingest.
  4. Enter IMAP host, port, username, and password, then save.
"""

import email
import hashlib
import imaplib
import json
import re
import socket
import structlog
from datetime import datetime, timedelta, timezone
from email.header import decode_header as _decode_header
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import select

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# IMAP helpers
# ---------------------------------------------------------------------------

def _get_imap_connection(config):
    host = config.imap_host or ""
    port = config.imap_port or (993 if config.imap_use_ssl else 143)
    if config.imap_use_ssl:
        conn = imaplib.IMAP4_SSL(host, port)
    else:
        conn = imaplib.IMAP4(host, port)
    conn.login(config.imap_username or "", config.imap_password or "")
    return conn


def _decode_mime_header(value: str) -> str:
    parts = _decode_header(value or "")
    out = []
    for part, charset in parts:
        if isinstance(part, bytes):
            out.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            out.append(part)
    return "".join(out)


def _extract_plain_text(msg: email.message.Message) -> str:
    """Return the best plain-text representation of a MIME message."""
    plain = []
    html_fallback = []

    for part in msg.walk():
        ct = part.get_content_type()
        if ct == "text/plain":
            charset = part.get_content_charset() or "utf-8"
            payload = part.get_payload(decode=True)
            if payload:
                plain.append(payload.decode(charset, errors="replace"))
        elif ct == "text/html":
            charset = part.get_content_charset() or "utf-8"
            payload = part.get_payload(decode=True)
            if payload:
                html_fallback.append(
                    re.sub(r"<[^>]+>", " ", payload.decode(charset, errors="replace"))
                )

    if plain:
        return "\n".join(plain)
    return "\n".join(html_fallback)


def _message_dedup_key(msg: email.message.Message, imap_uid: bytes) -> str:
    """Return a stable dedup key for this message."""
    mid = (msg.get("Message-ID") or "").strip()
    if mid:
        return mid[:200]
    # Fallback: hash sender + subject + date so we still deduplicate reliably
    raw = f"{msg.get('From','')}{msg.get('Subject','')}{msg.get('Date','')}"
    return "hash:" + hashlib.sha1(raw.encode()).hexdigest()


def _parse_sender(from_header: str) -> tuple[str, str]:
    match = re.match(r'^"?([^"<]+?)"?\s*<([^>]+)>', from_header.strip())
    if match:
        return match.group(1).strip(), match.group(2).strip()
    addr = from_header.strip().strip("<>")
    return "", addr


# ---------------------------------------------------------------------------
# Regex-based unit extraction
# ---------------------------------------------------------------------------

_UNIT_REGEXES = [
    re.compile(r'\bunit\s*#?\s*([A-Za-z]?\d+[A-Za-z]?)\b', re.IGNORECASE),
    re.compile(r'\bsuite\s*#?\s*([A-Za-z]?\d+[A-Za-z]?)\b', re.IGNORECASE),
    re.compile(r'\bapt\.?\s*#?\s*([A-Za-z]?\d+[A-Za-z]?)\b', re.IGNORECASE),
    re.compile(r'\bapartment\s*#?\s*([A-Za-z]?\d+[A-Za-z]?)\b', re.IGNORECASE),
    re.compile(r'\bsl\s*(\d+)\b', re.IGNORECASE),
    re.compile(r'\bstrata\s+lot\s*#?\s*(\d+)\b', re.IGNORECASE),
    re.compile(r'\blot\s*#?\s*(\d+)\b', re.IGNORECASE),
    # bare 3-4 digit room numbers only when preceded by common anchors
    re.compile(r'(?:from|in|for|re:?|re\s+unit|residence)\s+#?(\d{3,4}[A-Za-z]?)\b', re.IGNORECASE),
]


def _extract_unit_hint(subject: str, body: str) -> Optional[str]:
    """Return the first unit-like token found across subject then body."""
    for text in (subject, body[:2000]):
        for pat in _UNIT_REGEXES:
            m = pat.search(text)
            if m:
                return m.group(1).upper()
    return None


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
- unit_number: string or null (strata unit/lot number if mentioned, e.g. "304", "1A", "SL42")

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

def _find_lot_id(db: Session, unit_hint: Optional[str]) -> Optional[int]:
    if not unit_hint:
        return None
    from app.models import Lot

    hint = unit_hint.strip()

    # Exact unit_number match
    lot = db.execute(
        select(Lot).where(Lot.unit_number == hint)
    ).scalar_one_or_none()
    if lot:
        return lot.id

    # Case-insensitive unit_number match
    lot = db.execute(
        select(Lot).where(Lot.unit_number.ilike(hint))
    ).scalar_one_or_none()
    if lot:
        return lot.id

    # Numeric strata_lot_number match
    try:
        lot_num = int(hint)
        lot = db.execute(
            select(Lot).where(Lot.strata_lot_number == lot_num)
        ).scalar_one_or_none()
        if lot:
            return lot.id
    except ValueError:
        pass

    # Trailing-digit match: "0802" → "802" and vice-versa
    try:
        lot_num = int(hint.lstrip("0") or "0")
        lot = db.execute(
            select(Lot).where(Lot.strata_lot_number == lot_num)
        ).scalar_one_or_none()
        if lot:
            return lot.id
    except ValueError:
        pass

    return None


# ---------------------------------------------------------------------------
# Connection test (used by the settings endpoint)
# ---------------------------------------------------------------------------

def test_imap_connection(config) -> dict:
    """Try to connect and login; return {"ok": bool, "error": str|None}."""
    if not config.imap_host or not config.imap_username or not config.imap_password:
        return {"ok": False, "error": "IMAP host, username, and password are required"}
    try:
        conn = _get_imap_connection(config)
        conn.logout()
        return {"ok": True, "error": None}
    except imaplib.IMAP4.error as exc:
        return {"ok": False, "error": f"IMAP error: {exc}"}
    except socket.gaierror as exc:
        return {"ok": False, "error": f"Cannot reach host: {exc}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Main poll function
# ---------------------------------------------------------------------------

def poll_imap(db: Session) -> dict:
    """Load config from DB, poll IMAP mailbox, create issues. Returns stats dict."""
    from app.models import EmailIngestConfig, Issue, IssuePriority, IssueStatus

    config = db.get(EmailIngestConfig, 1)
    if not config or not config.enabled:
        return {"created": 0, "skipped": 0, "errors": 0, "pending": 0,
                "skipped_reason": "not configured or disabled"}
    if not config.imap_host or not config.imap_username or not config.imap_password:
        return {"created": 0, "skipped": 0, "errors": 0, "pending": 0,
                "skipped_reason": "IMAP credentials incomplete"}

    stats = {"created": 0, "skipped": 0, "errors": 0, "pending": 0}

    try:
        conn = _get_imap_connection(config)
    except Exception as exc:
        log.error("imap_connect_failed", error=str(exc))
        _save_poll_stats(db, stats)
        return stats

    try:
        mailbox = config.imap_mailbox or "INBOX"
        conn.select(mailbox)
        status, data = conn.search(None, "UNSEEN")
        if status != "OK":
            log.error("imap_search_failed", status=status)
            _save_poll_stats(db, stats)
            return stats

        uid_list = data[0].split()
        log.info("imap_unseen_messages", count=len(uid_list))

        for uid in uid_list:
            try:
                status, msg_data = conn.fetch(uid, "(RFC822)")
                if status != "OK" or not msg_data or not msg_data[0]:
                    stats["errors"] += 1
                    continue

                raw = msg_data[0][1]
                msg = email.message_from_bytes(raw)

                dedup_key = _message_dedup_key(msg, uid)
                existing = db.execute(
                    select(Issue).where(Issue.email_message_id == dedup_key)
                ).scalar_one_or_none()
                if existing:
                    stats["skipped"] += 1
                    conn.store(uid, "+FLAGS", "\\Seen")
                    continue

                subject = _decode_mime_header(msg.get("Subject", "(No subject)"))
                from_raw = _decode_mime_header(msg.get("From", ""))
                body = _extract_plain_text(msg)

                reporter_name, reporter_email = _parse_sender(from_raw)
                parsed = parse_email_with_ai(subject, body, from_raw, config)

                # Unit resolution: prefer AI extraction, fall back to regex
                ai_unit = parsed.get("unit_number")
                regex_unit = _extract_unit_hint(subject, body)
                unit_hint = ai_unit or regex_unit

                lot_id = _find_lot_id(db, unit_hint)

                if unit_hint and not lot_id:
                    issue_status = IssueStatus.pending_assignment
                    raw_unit_hint = unit_hint
                else:
                    issue_status = IssueStatus.open
                    raw_unit_hint = None

                issue = Issue(
                    title=parsed["title"],
                    description=f"**From:** {from_raw}\n**Subject:** {subject}\n\n{parsed['description']}",
                    priority=IssuePriority(parsed["priority"]),
                    status=issue_status,
                    source="email",
                    reporter_email=reporter_email or None,
                    reporter_name=reporter_name or None,
                    email_message_id=dedup_key,
                    related_lot_id=lot_id,
                    raw_unit_hint=raw_unit_hint,
                )
                db.add(issue)
                db.commit()

                conn.store(uid, "+FLAGS", "\\Seen")

                if issue_status == IssueStatus.pending_assignment:
                    stats["pending"] += 1
                    log.info("email_issue_pending", dedup=dedup_key, hint=unit_hint)
                else:
                    stats["created"] += 1
                    log.info("email_issue_created", dedup=dedup_key, title=parsed["title"])

            except Exception as exc:
                log.error("imap_message_failed", uid=uid, error=str(exc))
                db.rollback()
                stats["errors"] += 1

    finally:
        try:
            conn.logout()
        except Exception:
            pass

    _save_poll_stats(db, stats)
    log.info("imap_poll_complete", **stats)
    return stats


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
    from app.models import EmailIngestConfig

    config = db.get(EmailIngestConfig, 1)
    if not config or not config.enabled:
        return

    now = datetime.now(timezone.utc)
    if config.last_polled_at:
        elapsed = now - config.last_polled_at.replace(tzinfo=timezone.utc)
        interval = timedelta(minutes=max(1, config.poll_interval_minutes))
        if elapsed < interval:
            return

    poll_imap(db)
