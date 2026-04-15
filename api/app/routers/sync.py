"""
Listmonk audience sync router.

Syncs current owners and tenants (anyone with an email contact method and an
active lot assignment) to a Listmonk mailing list. Creates the list if it doesn't
exist. Upserts subscribers by email (name + list membership).
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, require_csrf, require_write
from app.models import (
    ContactMethod, ContactMethodType, LotAssignment, LotAssignmentRole, User
)

try:
    import httpx
    _HTTPX_AVAILABLE = True
except ImportError:
    _HTTPX_AVAILABLE = False

log = structlog.get_logger()

router = APIRouter(prefix="/sync", tags=["sync"])

# Roles we consider "resident" for mailing list purposes
_RESIDENT_ROLES = {
    LotAssignmentRole.owner_occupant,
    LotAssignmentRole.owner_absentee,
    LotAssignmentRole.tenant,
}

_LIST_NAME = "Spectrum 4 Residents"
_LIST_TYPE = "private"


def _listmonk_request(method: str, path: str, json: dict | None = None) -> dict:
    """Make an authenticated request to Listmonk."""
    if not _HTTPX_AVAILABLE:
        raise HTTPException(status_code=503, detail="httpx not installed — cannot contact Listmonk.")

    url = f"{settings.listmonk_base_url.rstrip('/')}{path}"
    with httpx.Client(timeout=15.0) as client:
        resp = client.request(
            method,
            url,
            json=json,
            auth=(settings.listmonk_username, settings.listmonk_password),
        )
    if resp.status_code >= 400:
        log.error("listmonk_error", status=resp.status_code, body=resp.text[:500])
        raise HTTPException(
            status_code=502,
            detail=f"Listmonk returned {resp.status_code}: {resp.text[:200]}",
        )
    return resp.json() if resp.text else {}


def _get_or_create_list() -> int:
    """Return the Listmonk list ID for our residents list, creating it if needed."""
    data = _listmonk_request("GET", "/api/lists?page=1&per_page=100")
    for lst in data.get("data", {}).get("results", []):
        if lst["name"] == _LIST_NAME:
            return lst["id"]

    # Create the list
    result = _listmonk_request("POST", "/api/lists", json={
        "name": _LIST_NAME,
        "type": _LIST_TYPE,
        "optin": "single",
        "tags": ["residents", "spectrum4"],
    })
    return result["data"]["id"]


@router.post("/listmonk")
def sync_listmonk(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
    _csrf: None = Depends(require_csrf),
):
    """
    Sync current residents (owners + tenants with emails) to Listmonk.
    Returns a summary of upserted / skipped contacts.
    """
    # Collect all active assignments for resident roles
    assignments = db.execute(
        select(LotAssignment)
        .where(LotAssignment.is_current.is_(True))
        .where(LotAssignment.role.in_(list(_RESIDENT_ROLES)))
    ).scalars().all()

    # For each assignment, get party email(s)
    seen_emails: set[str] = set()
    to_sync: list[dict] = []

    for assignment in assignments:
        emails = db.execute(
            select(ContactMethod)
            .where(ContactMethod.party_id == assignment.party_id)
            .where(ContactMethod.method_type == ContactMethodType.email)
        ).scalars().all()

        for cm in emails:
            email = cm.value.strip().lower()
            if email and email not in seen_emails:
                seen_emails.add(email)

                # Fetch party name (lazy — party is accessible via assignment.party but
                # we haven't eager-loaded it; just query by id)
                from app.models import Party
                party = db.get(Party, assignment.party_id)
                to_sync.append({
                    "email": email,
                    "name": party.full_name if party else email,
                })

    if not to_sync:
        return {"synced": 0, "skipped": 0, "message": "No residents with email addresses found."}

    # Get or create the mailing list
    try:
        list_id = _get_or_create_list()
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("listmonk_list_lookup_failed")
        raise HTTPException(status_code=502, detail=f"Could not reach Listmonk: {exc}") from exc

    # Upsert subscribers in bulk
    synced = 0
    skipped = 0
    for subscriber in to_sync:
        try:
            _listmonk_request("POST", "/api/subscribers", json={
                "email": subscriber["email"],
                "name": subscriber["name"],
                "status": "enabled",
                "lists": [list_id],
                "preconfirm_subscriptions": True,
            })
            synced += 1
        except HTTPException:
            skipped += 1

    log.info("listmonk_sync_complete", synced=synced, skipped=skipped, list_id=list_id)
    return {
        "synced": synced,
        "skipped": skipped,
        "list_id": list_id,
        "list_name": _LIST_NAME,
        "message": f"Synced {synced} subscribers to '{_LIST_NAME}' (skipped {skipped}).",
    }
