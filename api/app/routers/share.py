"""Public share router — no authentication required.

Endpoints here are protected only by a time-limited HMAC token so that
external recipients (who don't have CRM accounts) can view incident details
and media attached to a shared incident.
"""

import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

from app.database import SessionLocal
from app.models import Document, Incident
from app.utils.share_token import verify_share_token, SHARE_MAX_AGE

router = APIRouter(prefix="/share", tags=["share"])


# ---------------------------------------------------------------------------
# Pydantic models for the public response (no sensitive fields)
# ---------------------------------------------------------------------------

class SharedDoc(BaseModel):
    id: int
    original_filename: Optional[str]
    mime_type: Optional[str]
    file_size_bytes: Optional[int]
    caption: Optional[str]
    tags: Optional[str]
    is_processing: bool
    media_url: str
    thumbnail_url: str


class SharedLot(BaseModel):
    strata_lot_number: int
    unit_number: Optional[str]


class SharedIncident(BaseModel):
    id: int
    reference: str
    incident_date: datetime
    category: str
    description: str
    reported_by: Optional[str]
    status: str
    resolution: Optional[str]
    lot: Optional[SharedLot]
    common_area_description: Optional[str]
    media: list[SharedDoc]
    share_expires_days: int


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/incident/{token}", response_model=SharedIncident)
def get_shared_incident(token: str):
    try:
        incident_id = verify_share_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    db: Session = SessionLocal()
    try:
        incident = db.get(Incident, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found.")

        docs = db.execute(
            select(Document)
            .where(Document.linked_entity_type == "incident")
            .where(Document.linked_entity_id == incident_id)
            .order_by(Document.uploaded_at.asc())
        ).scalars().all()

        media = [
            SharedDoc(
                id=doc.id,
                original_filename=doc.original_filename,
                mime_type=doc.mime_type,
                file_size_bytes=doc.file_size_bytes,
                caption=doc.caption,
                tags=doc.tags,
                is_processing=doc.is_processing,
                media_url=f"/api/share/media/{token}/{doc.id}",
                thumbnail_url=f"/api/share/media/{token}/{doc.id}?thumb=1",
            )
            for doc in docs
        ]

        lot = None
        if incident.lot:
            lot = SharedLot(
                strata_lot_number=incident.lot.strata_lot_number,
                unit_number=incident.lot.unit_number,
            )

        return SharedIncident(
            id=incident.id,
            reference=incident.reference,
            incident_date=incident.incident_date,
            category=incident.category,
            description=incident.description,
            reported_by=incident.reported_by,
            status=incident.status.value,
            resolution=incident.resolution,
            lot=lot,
            common_area_description=incident.common_area_description,
            media=media,
            share_expires_days=SHARE_MAX_AGE // 86400,
        )
    finally:
        db.close()


@router.get("/media/{token}/{doc_id}")
def get_shared_media(token: str, doc_id: int, thumb: bool = False):
    try:
        incident_id = verify_share_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    db: Session = SessionLocal()
    try:
        doc = db.get(Document, doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Not found.")
        # Verify this doc actually belongs to the shared incident
        if doc.linked_entity_type != "incident" or doc.linked_entity_id != incident_id:
            raise HTTPException(status_code=403, detail="Access denied.")

        if doc.is_processing:
            raise HTTPException(status_code=202, detail="Media is still being processed.")

        if thumb:
            from app.utils.media import thumbnail_path_for
            thumb_path = thumbnail_path_for(doc.storage_path)
            serve_path = thumb_path if os.path.exists(thumb_path) else doc.storage_path
            media_type = "image/jpeg" if os.path.exists(thumb_path) else (doc.mime_type or "application/octet-stream")
        else:
            serve_path = doc.storage_path
            media_type = doc.mime_type or "application/octet-stream"

        if not os.path.exists(serve_path):
            raise HTTPException(status_code=404, detail="File not found on disk.")

        is_inline = media_type.startswith("image/") or media_type.startswith("video/")
        return FileResponse(
            path=serve_path,
            media_type=media_type,
            headers={
                "Content-Disposition": f'{"inline" if is_inline else "attachment"}; filename="{doc.original_filename or "file"}"',
                "Cache-Control": "private, max-age=3600",
            },
        )
    finally:
        db.close()
