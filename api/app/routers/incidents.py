"""Incident log router — property/common-area incidents and their status."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.audit import log_action
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, require_csrf, require_write
from app.email import send_email
from app.models import Document, Incident, IncidentStatus, Lot, User
from app.schemas.incidents import IncidentCreate, IncidentOut, IncidentUpdate
from app.utils.reference import generate_reference
from app.utils.share_token import create_share_token

router = APIRouter(prefix="/incidents", tags=["incidents"])


def _load(incident_id: int, db: Session) -> Incident:
    inc = db.execute(
        select(Incident)
        .where(Incident.id == incident_id)
        .options(selectinload(Incident.lot))
    ).scalar_one_or_none()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    return inc


@router.get("", response_model=list[IncidentOut])
def list_incidents(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    status_filter: Optional[IncidentStatus] = Query(None, alias="status"),
    lot_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    open_only: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    stmt = (
        select(Incident)
        .options(selectinload(Incident.lot))
        .order_by(Incident.incident_date.desc(), Incident.id.desc())
    )
    if status_filter:
        stmt = stmt.where(Incident.status == status_filter)
    if open_only:
        stmt = stmt.where(Incident.status.in_([IncidentStatus.open, IncidentStatus.in_progress]))
    if lot_id:
        stmt = stmt.where(Incident.lot_id == lot_id)
    if category:
        stmt = stmt.where(Incident.category.ilike(f"%{category}%"))
    stmt = stmt.offset(skip).limit(limit)
    return db.execute(stmt).scalars().all()


@router.post("", response_model=IncidentOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_csrf)])
def create_incident(
    request: Request,
    body: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    if body.lot_id and not db.get(Lot, body.lot_id):
        raise HTTPException(status_code=404, detail="Lot not found")

    inc = Incident(reference=generate_reference("TKT"), **body.model_dump())
    db.add(inc)
    log_action(db, action="create", entity_type="incident", entity_id=None,
               changes=body.model_dump(mode="json"),
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    db.refresh(inc)
    return _load(inc.id, db)


@router.get("/{incident_id}", response_model=IncidentOut)
def get_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return _load(incident_id, db)


@router.patch("/{incident_id}", response_model=IncidentOut,
              dependencies=[Depends(require_csrf)])
def update_incident(
    incident_id: int,
    request: Request,
    body: IncidentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    inc = db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    updates = body.model_dump(exclude_unset=True)
    if "lot_id" in updates and updates["lot_id"] and not db.get(Lot, updates["lot_id"]):
        raise HTTPException(status_code=404, detail="Lot not found")

    for field, value in updates.items():
        setattr(inc, field, value)

    log_action(db, action="update", entity_type="incident", entity_id=incident_id,
               changes=body.model_dump(exclude_unset=True, mode="json"),
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    return _load(incident_id, db)


@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_csrf)])
def delete_incident(
    incident_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    inc = db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    log_action(db, action="delete", entity_type="incident", entity_id=incident_id,
               changes={},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.delete(inc)
    db.commit()


# ---------------------------------------------------------------------------
# Email sharing
# ---------------------------------------------------------------------------

class SendEmailRequest(BaseModel):
    to: EmailStr
    message: Optional[str] = None


@router.post("/{incident_id}/send-email", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(require_csrf)])
def send_incident_email(
    incident_id: int,
    request: Request,
    body: SendEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inc = _load(incident_id, db)

    docs = db.execute(
        select(Document)
        .where(Document.linked_entity_type == "incident")
        .where(Document.linked_entity_id == incident_id)
        .order_by(Document.uploaded_at.asc())
    ).scalars().all()

    token = create_share_token(incident_id)
    share_url = f"{settings.app_base_url}/share/incident/{token}"

    location = (
        f"SL{inc.lot.strata_lot_number}"
        + (f" Unit {inc.lot.unit_number}" if inc.lot and inc.lot.unit_number else "")
        if inc.lot else inc.common_area_description or "Common area"
    )
    date_str = inc.incident_date.strftime("%B %-d, %Y")
    status_label = inc.status.value.replace("_", " ").title()

    # Build media rows for HTML email
    image_rows = ""
    video_count = 0
    for doc in docs:
        if doc.is_processing:
            continue
        mime = doc.mime_type or ""
        if mime.startswith("image/"):
            thumb_src = f"{settings.app_base_url}/api/share/media/{token}/{doc.id}?thumb=1"
            caption = doc.caption or doc.original_filename or "Image"
            image_rows += (
                f'<td style="padding:4px;vertical-align:top;width:160px">'
                f'<a href="{share_url}" style="text-decoration:none">'
                f'<img src="{thumb_src}" alt="{caption}" width="152" height="114" '
                f'style="border-radius:6px;object-fit:cover;display:block;border:1px solid #e2e8f0"/>'
                f'<span style="display:block;font-size:11px;color:#64748b;margin-top:4px">{caption}</span>'
                f'</a></td>'
            )
        elif mime.startswith("video/"):
            video_count += 1

    media_section = ""
    if image_rows or video_count:
        media_section = f"""
        <tr><td style="padding-top:24px">
          <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#1e293b;text-transform:uppercase;letter-spacing:.05em">
            Attachments
          </p>
          <table cellpadding="0" cellspacing="0"><tr>{image_rows}</tr></table>
          {"" if not video_count else f'<p style="margin:8px 0 0;font-size:12px;color:#64748b">+ {video_count} video{"s" if video_count>1 else ""} — view online below</p>'}
        </td></tr>"""

    personal_note = ""
    if body.message:
        personal_note = f"""
        <tr><td style="padding:16px;background:#f8fafc;border-radius:8px;margin-bottom:16px">
          <p style="margin:0;font-size:13px;color:#334155;font-style:italic">"{body.message}"</p>
          <p style="margin:6px 0 0;font-size:12px;color:#94a3b8">— {current_user.email}</p>
        </td></tr>"""

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <!-- Header -->
  <tr><td style="background:#1e293b;padding:24px 32px">
    <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em">Spectrum 4 — Strata Plan BCS2611</p>
    <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff">Incident Report</p>
    <p style="margin:4px 0 0;font-size:13px;color:#cbd5e1">{inc.reference}</p>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:32px">
    <table width="100%" cellpadding="0" cellspacing="0">
      {personal_note}
      <!-- Key fields -->
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="8" style="border-collapse:collapse">
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b;width:130px">Date</td>
            <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;font-weight:500">{date_str}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b">Location</td>
            <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;font-weight:500">{location}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b">Category</td>
            <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;font-weight:500">{inc.category.replace("_"," ").title()}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b">Status</td>
            <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;font-weight:500">{status_label}</td>
          </tr>
          {"" if not inc.reported_by else f'<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b">Reported by</td><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;font-weight:500">{inc.reported_by}</td></tr>'}
        </table>
      </td></tr>
      <!-- Description -->
      <tr><td style="padding-top:20px">
        <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Description</p>
        <p style="margin:0;font-size:14px;color:#334155;line-height:1.6">{inc.description}</p>
      </td></tr>
      {"" if not inc.resolution else f'<tr><td style="padding-top:16px"><p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Resolution</p><p style="margin:0;font-size:14px;color:#334155;line-height:1.6">{inc.resolution}</p></td></tr>'}
      {media_section}
      <!-- CTA -->
      <tr><td style="padding-top:28px;text-align:center">
        <a href="{share_url}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px">
          View Full Report &amp; Media →
        </a>
        <p style="margin:12px 0 0;font-size:11px;color:#94a3b8">Link expires in 14 days</p>
      </td></tr>
    </table>
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0">
    <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center">
      Spectrum 4 Strata Council · Strata Plan BCS2611 · This email was sent by {current_user.email}
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>"""

    plain = (
        f"Incident Report — {inc.reference}\n\n"
        f"Date: {date_str}\nLocation: {location}\n"
        f"Category: {inc.category}\nStatus: {status_label}\n\n"
        f"Description:\n{inc.description}\n\n"
        + (f"Resolution:\n{inc.resolution}\n\n" if inc.resolution else "")
        + (f"Note from {current_user.email}:\n{body.message}\n\n" if body.message else "")
        + f"View full report and media: {share_url}\n(Link expires in 14 days)"
    )

    ok = send_email(
        to_address=str(body.to),
        subject=f"Incident Report {inc.reference} — {location}",
        body_text=plain,
        body_html=html,
    )
    if not ok:
        raise HTTPException(status_code=502, detail="Failed to send email. Please try again.")
