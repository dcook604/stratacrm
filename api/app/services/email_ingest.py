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
    "Extract structured incident data from resident or staff emails. "
    "Return ONLY a JSON object — no markdown, no explanation."
)

_USER_PROMPT = """\
Extract a structured incident report from this email and return a JSON object with these fields:
- category: one of "Water Damage" | "Elevator" | "Parkade" | "Common Area Damage" | "Security" | \
"Fire Safety" | "Garbage / Recycling" | "Amenity Room" | "Lobby / Entrance" | "Roof / Exterior" | \
"Suite Damage" | "Noise" | "Parking" | "Other"
- description: string (preserve all relevant details and context from the email)
- unit_number: string or null (strata unit/lot number if mentioned, e.g. "304", "1A", "SL42")

Email:
From: {sender}
Subject: {subject}

{body}"""

_VALID_CATEGORIES = {
    "Water Damage", "Elevator", "Parkade", "Common Area Damage", "Security",
    "Fire Safety", "Garbage / Recycling", "Amenity Room", "Lobby / Entrance",
    "Roof / Exterior", "Suite Damage", "Noise", "Parking", "Other",
}


def _parse_ai_json(text: str) -> dict:
    text = re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("`").strip()
    try:
        data = json.loads(text)
        category = data.get("category", "Other")
        if category not in _VALID_CATEGORIES:
            category = "Other"
        return {
            "category": category,
            "description": str(data.get("description", "")),
            "unit_number": data.get("unit_number"),
        }
    except (json.JSONDecodeError, TypeError):
        log.warning("ai_parse_json_failed", preview=text[:200])
        return {
            "category": "Other",
            "description": text,
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
    """Load config from DB, poll IMAP mailbox, create incidents. Returns stats dict."""
    from app.models import EmailIngestConfig, Incident, IncidentStatus
    from app.utils.reference import generate_reference

    config = db.get(EmailIngestConfig, 1)
    if not config or not config.enabled:
        return {"created": 0, "skipped": 0, "errors": 0, "pending": 0,
                "skipped_reason": "not configured or disabled"}
    if not config.imap_host or not config.imap_username or not config.imap_password:
        return {"created": 0, "skipped": 0, "errors": 0, "pending": 0,
                "skipped_reason": "IMAP credentials incomplete"}

    stats: dict = {"created": 0, "skipped": 0, "errors": 0, "pending": 0, "error_details": []}

    try:
        conn = _get_imap_connection(config)
    except Exception as exc:
        log.error("imap_connect_failed", error=str(exc))
        stats["error_details"].append({"subject": None, "from": None, "error": f"Connection failed: {exc}"})
        stats["errors"] += 1
        _save_poll_stats(db, stats)
        return stats

    try:
        mailbox = config.imap_mailbox or "INBOX"
        conn.select(mailbox)
        status, data = conn.search(None, "UNSEEN")
        if status != "OK":
            log.error("imap_search_failed", status=status)
            stats["error_details"].append({"subject": None, "from": None, "error": f"IMAP SEARCH failed: {status}"})
            stats["errors"] += 1
            _save_poll_stats(db, stats)
            return stats

        uid_list = data[0].split()
        log.info("imap_unseen_messages", count=len(uid_list))

        for uid in uid_list:
            subject_hint = None
            from_hint = None
            try:
                status, msg_data = conn.fetch(uid, "(RFC822)")
                if status != "OK" or not msg_data or not msg_data[0]:
                    stats["errors"] += 1
                    stats["error_details"].append({"subject": None, "from": None, "error": f"Failed to fetch message uid={uid.decode()}"})
                    continue

                raw = msg_data[0][1]
                msg = email.message_from_bytes(raw)

                subject_hint = _decode_mime_header(msg.get("Subject", "(No subject)"))
                from_hint = _decode_mime_header(msg.get("From", ""))

                dedup_key = _message_dedup_key(msg, uid)
                existing = db.execute(
                    select(Incident).where(Incident.email_message_id == dedup_key)
                ).scalar_one_or_none()
                if existing:
                    stats["skipped"] += 1
                    conn.store(uid, "+FLAGS", "\\Seen")
                    continue

                body = _extract_plain_text(msg)

                _, reporter_email = _parse_sender(from_hint)
                parsed = parse_email_with_ai(subject_hint, body, from_hint, config)

                # Unit resolution: prefer AI extraction, fall back to regex
                ai_unit = parsed.get("unit_number")
                regex_unit = _extract_unit_hint(subject_hint, body)
                unit_hint = ai_unit or regex_unit

                lot_id = _find_lot_id(db, unit_hint)

                if unit_hint and not lot_id:
                    inc_status = IncidentStatus.pending_assignment
                    raw_unit_hint = unit_hint
                else:
                    inc_status = IncidentStatus.open
                    raw_unit_hint = None

                incident = Incident(
                    reference=generate_reference("TKT"),
                    incident_date=datetime.now(timezone.utc),
                    category=parsed["category"],
                    description=f"**From:** {from_hint}\n**Subject:** {subject_hint}\n\n{parsed['description']}",
                    reported_by=from_hint or None,
                    status=inc_status,
                    lot_id=lot_id,
                    source="email",
                    reporter_email=reporter_email or None,
                    email_message_id=dedup_key,
                    raw_unit_hint=raw_unit_hint,
                )
                db.add(incident)
                db.commit()

                conn.store(uid, "+FLAGS", "\\Seen")

                if inc_status == IncidentStatus.pending_assignment:
                    stats["pending"] += 1
                    log.info("email_incident_pending", dedup=dedup_key, hint=unit_hint)
                else:
                    stats["created"] += 1
                    log.info("email_incident_created", dedup=dedup_key, category=parsed["category"])

            except Exception as exc:
                log.error("imap_message_failed", uid=uid, error=str(exc))
                db.rollback()
                stats["errors"] += 1
                stats["error_details"].append({
                    "subject": subject_hint,
                    "from": from_hint,
                    "error": str(exc),
                })

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
