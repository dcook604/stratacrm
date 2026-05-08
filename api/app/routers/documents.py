"""Document storage router — upload, list, download generic file attachments."""

import logging
import os
import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, UploadFile, File, Form, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal

log = logging.getLogger(__name__)

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, require_csrf, require_write
from app.models import Document, User
from app.schemas.documents import DocumentOut
from app.utils.media import (
    compress_image, generate_thumbnail, generate_video_thumbnail,
    transcode_video, thumbnail_path_for,
)

router = APIRouter(prefix="/documents", tags=["documents"])

_VALID_ENTITY_TYPES: set[str] = {
    "lot",
    "party",
    "infraction",
    "incident",
    "issue",
    "bylaw",
}

_ALLOWED_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    # Video types
    "video/mp4",
    "video/quicktime",
    "video/mov",
    "video/webm",
    "video/x-msvideo",
    "video/avi",
    "video/mpeg",
    "video/ogg",
}

# Map MIME types to expected file extensions for validation
_MIME_TO_EXT: dict[str, set[str]] = {
    "application/pdf": {".pdf"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "image/gif": {".gif"},
    "image/webp": {".webp"},
    "text/plain": {".txt"},
    "application/msword": {".doc"},
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {".docx"},
    "application/vnd.ms-excel": {".xls"},
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {".xlsx"},
    "video/mp4": {".mp4"},
    "video/quicktime": {".mov"},
    "video/mov": {".mov"},
    "video/webm": {".webm"},
    "video/x-msvideo": {".avi"},
    "video/avi": {".avi"},
    "video/mpeg": {".mpeg", ".mpg"},
    "video/ogg": {".ogv"},
}

_MAX_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB raw ingest limit (videos transcoded after)
_CHUNK = 4 * 1024 * 1024             # 4 MB streaming chunks


def _doc_out(doc: Document) -> DocumentOut:
    return DocumentOut(
        id=doc.id,
        original_filename=doc.original_filename,
        mime_type=doc.mime_type,
        file_size_bytes=doc.file_size_bytes,
        linked_entity_type=doc.linked_entity_type,
        linked_entity_id=doc.linked_entity_id,
        uploaded_at=doc.uploaded_at,
        download_url=f"/api/documents/{doc.id}/download",
        thumbnail_url=f"/api/documents/{doc.id}/thumbnail",
        caption=doc.caption,
        tags=doc.tags,
    )


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_csrf)])
async def upload_document(
    background_tasks: BackgroundTasks,
    request: Request,
    file: UploadFile = File(...),
    entity_type: str = Form(...),
    entity_id: int = Form(...),
    caption: str = Form(None),
    tags: str = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    if entity_type not in _VALID_ENTITY_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid entity_type '{entity_type}'. Must be one of: {', '.join(sorted(_VALID_ENTITY_TYPES))}"
        )

    if entity_id < 1:
        raise HTTPException(status_code=422, detail="entity_id must be a positive integer")

    if file.content_type and file.content_type not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"File type '{file.content_type}' is not allowed."
        )

    # Validate file extension matches declared MIME type
    if file.filename and file.content_type:
        ext = os.path.splitext(file.filename)[1].lower()
        expected_exts = _MIME_TO_EXT.get(file.content_type, set())
        if expected_exts and ext not in expected_exts:
            raise HTTPException(
                status_code=422,
                detail=f"File extension '{ext}' does not match MIME type '{file.content_type}'. "
                       f"Expected: {', '.join(expected_exts)}"
            )

    os.makedirs(settings.uploads_dir, exist_ok=True)
    safe_name = os.path.basename(file.filename or "upload")
    storage_filename = f"{entity_type}_{entity_id}_{doc_safe(safe_name)}"
    storage_path = os.path.join(settings.uploads_dir, storage_filename)

    if os.path.exists(storage_path):
        base, ext = os.path.splitext(storage_filename)
        counter = 1
        while os.path.exists(storage_path):
            storage_path = os.path.join(settings.uploads_dir, f"{base}_{counter}{ext}")
            counter += 1

    # Stream to disk in chunks — avoids loading large videos into memory
    total_bytes = 0
    try:
        with open(storage_path, "wb") as fout:
            while True:
                chunk = await file.read(_CHUNK)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > _MAX_BYTES:
                    raise HTTPException(status_code=413, detail="File exceeds 2 GB limit.")
                fout.write(chunk)
    except HTTPException:
        if os.path.exists(storage_path):
            os.unlink(storage_path)
        raise

    content_type = file.content_type or ""
    is_image = content_type.startswith("image/")
    is_video = content_type.startswith("video/")

    # Images: compress synchronously (fast, a few seconds at most)
    effective_mime = content_type
    final_size = total_bytes
    if is_image:
        try:
            compressed_path, compressed_size = compress_image(storage_path)
            if compressed_path != storage_path:
                os.replace(compressed_path, storage_path)
            final_size = compressed_size
        except Exception:
            pass
        effective_mime = "image/jpeg"
        try:
            generate_thumbnail(storage_path)
        except Exception:
            pass

    # Videos: commit record immediately as is_processing=True, transcode in background
    doc = Document(
        storage_path=storage_path,
        original_filename=safe_name,
        mime_type=effective_mime,
        file_size_bytes=final_size,
        uploaded_by_id=current_user.id,
        linked_entity_type=entity_type,
        linked_entity_id=entity_id,
        caption=caption or None,
        tags=tags or None,
        is_processing=is_video,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    if is_video:
        background_tasks.add_task(_transcode_background, doc.id, storage_path)

    return _doc_out(doc)


def _transcode_background(doc_id: int, raw_path: str) -> None:
    """Background task: transcode raw video to H.264/MP4, update the DB record."""
    db = SessionLocal()
    try:
        doc = db.get(Document, doc_id)
        if not doc:
            return

        try:
            transcoded_path, transcoded_size = transcode_video(raw_path)
            if transcoded_path != raw_path:
                os.unlink(raw_path)
            try:
                generate_video_thumbnail(transcoded_path)
            except Exception:
                pass
            doc.storage_path = transcoded_path
            doc.mime_type = "video/mp4"
            doc.file_size_bytes = transcoded_size
        except Exception as exc:
            log.error("Video transcode failed for doc %d: %s", doc_id, exc)
            # Keep the raw file playable; just clear the processing flag

        doc.is_processing = False
        db.commit()
    finally:
        db.close()


def doc_safe(name: str) -> str:
    """Sanitize filename — keep only alphanumeric, dot, dash, underscore."""
    import re
    return re.sub(r"[^\w.\-]", "_", name)[:200]


@router.get("", response_model=list[DocumentOut])
def list_documents(
    entity_type: str = Query(...),
    entity_id: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    docs = db.execute(
        select(Document)
        .where(Document.linked_entity_type == entity_type)
        .where(Document.linked_entity_id == entity_id)
        .order_by(Document.uploaded_at.desc())
    ).scalars().all()
    return [_doc_out(d) for d in docs]


@router.get("/{document_id}/download")
def download_document(
    document_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not os.path.exists(doc.storage_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    is_inline = doc.mime_type and (
        doc.mime_type.startswith("image/") or doc.mime_type.startswith("video/")
    )
    disposition = "inline" if is_inline else "attachment"
    # FileResponse streams the file and supports HTTP Range requests (video seeking)
    return FileResponse(
        path=doc.storage_path,
        media_type=doc.mime_type or "application/octet-stream",
        filename=doc.original_filename or "download",
        headers={"Content-Disposition": f'{disposition}; filename="{doc.original_filename or "download"}"'},
    )


@router.get("/{document_id}/thumbnail")
def thumbnail_document(
    document_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Serve a smaller thumbnail for image documents (faster loading in grids)."""
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    thumb_path = thumbnail_path_for(doc.storage_path)
    if not os.path.exists(thumb_path):
        # Fall back to the original if no thumbnail exists
        thumb_path = doc.storage_path

    if not os.path.exists(thumb_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    with open(thumb_path, "rb") as f:
        data = f.read()

    return Response(
        content=data,
        media_type="image/jpeg",
        headers={
            "Content-Disposition": f'inline; filename="thumb_{doc.original_filename or "image"}"'
        },
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_csrf)])
def delete_document(
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Remove files from disk (best-effort)
    if doc.storage_path and os.path.exists(doc.storage_path):
        try:
            os.remove(doc.storage_path)
        except OSError:
            pass
    thumb_path = thumbnail_path_for(doc.storage_path) if doc.storage_path else None
    if thumb_path and os.path.exists(thumb_path):
        try:
            os.remove(thumb_path)
        except OSError:
            pass

    db.delete(doc)
    db.commit()
