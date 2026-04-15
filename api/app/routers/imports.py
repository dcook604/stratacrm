"""
Import pipeline router — PDF upload, staged review, confirm, diff.

Endpoints
---------
POST   /import/upload                             Upload PDF, create batch
GET    /import/batches                            List all batches
GET    /import/batches/{batch_id}                 Batch summary
GET    /import/batches/{batch_id}/lots            Paginated staged lots
GET    /import/batches/{batch_id}/lots/{lot_id}   Single staged lot detail
GET    /import/batches/{batch_id}/diff            Re-import diff summary
PATCH  /import/batches/{batch_id}/lots/{lot_id}/parties/{party_id}  Set action
POST   /import/batches/{batch_id}/lots/{lot_id}/confirm  Commit lot
POST   /import/batches/{batch_id}/lots/{lot_id}/skip     Skip lot
"""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import (
    APIRouter, Depends, File, HTTPException, Query,
    Request, UploadFile, status,
)
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.audit import log_action
from app.database import get_db
from app.dependencies import get_current_user, require_csrf, require_write
from app.models import Lot, Party
from app.models_import import (
    ImportBatch, ImportBatchStatus, ImportStagedLot, ImportStagedParty,
    StagedLotStatus,
)
from app.pdf_import.duplicate_detection import detect_duplicates_for_batch
from app.pdf_import.importer import (
    confirm_lot, maybe_complete_batch, compute_diff, skip_lot,
)
from app.pdf_import.parser import parse_owner_list_pdf
from app.schemas.imports import (
    ConfirmLotResponse, ImportBatchOut, PaginatedStagedLots,
    SetPartyActionRequest, StagedContactMethod, StagedLotOut, StagedPartyOut,
)
from app.models import User

router = APIRouter(prefix="/import", tags=["import"])
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_batch_or_404(db: Session, batch_id: int) -> ImportBatch:
    batch = db.execute(
        select(ImportBatch)
        .where(ImportBatch.id == batch_id)
        .options(selectinload(ImportBatch.staged_lots))
    ).scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found")
    return batch


def _get_staged_lot_or_404(db: Session, batch_id: int, lot_id: int) -> ImportStagedLot:
    sl = db.execute(
        select(ImportStagedLot)
        .where(ImportStagedLot.id == lot_id)
        .where(ImportStagedLot.batch_id == batch_id)
        .options(selectinload(ImportStagedLot.parties))
    ).scalar_one_or_none()
    if not sl:
        raise HTTPException(status_code=404, detail="Staged lot not found")
    return sl


def _serialize_staged_lot(db: Session, sl: ImportStagedLot) -> StagedLotOut:
    parties_out: list[StagedPartyOut] = []
    for sp in sl.parties:
        dup_name: Optional[str] = None
        if sp.detected_duplicate_party_id:
            p = db.get(Party, sp.detected_duplicate_party_id)
            dup_name = p.full_name if p else None

        cm_out = [
            StagedContactMethod(
                method_type=cm.get("method_type", ""),
                value=cm.get("value", ""),
                is_primary=cm.get("is_primary", False),
            )
            for cm in (sp.contact_methods or [])
        ]

        parties_out.append(StagedPartyOut(
            id=sp.id,
            role=sp.role,
            full_name=sp.full_name,
            party_type=sp.party_type,
            is_property_manager=sp.is_property_manager,
            parent_name=sp.parent_name,
            mailing_address_line1=sp.mailing_address_line1,
            mailing_address_line2=sp.mailing_address_line2,
            mailing_city=sp.mailing_city,
            mailing_province=sp.mailing_province,
            mailing_postal_code=sp.mailing_postal_code,
            contact_methods=cm_out,
            form_k_filed_date=sp.form_k_filed_date,
            notes=sp.notes,
            detected_duplicate_party_id=sp.detected_duplicate_party_id,
            duplicate_confidence=sp.duplicate_confidence,
            duplicate_party_name=dup_name,
            action=sp.action.value if sp.action else None,
            merge_target_party_id=sp.merge_target_party_id,
        ))

    has_duplicates = any(
        sp.detected_duplicate_party_id is not None
        and sp.action is None   # not yet resolved
        for sp in sl.parties
    )

    return StagedLotOut(
        id=sl.id,
        strata_lot_number=sl.strata_lot_number,
        unit_number=sl.unit_number,
        lot_id=sl.lot_id,
        status=sl.status,
        parties=parties_out,
        parse_warnings=list(sl.parse_warnings or []),
        has_duplicates=has_duplicates,
        confirmed_at=sl.confirmed_at,
    )


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@router.post(
    "/upload",
    response_model=ImportBatchOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def upload_owner_list(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    pdf_bytes = await file.read()
    if len(pdf_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    log.info("Parsing PDF upload: %s (%d bytes)", file.filename, len(pdf_bytes))

    try:
        parsed_lots = parse_owner_list_pdf(pdf_bytes)
    except Exception as exc:
        log.exception("PDF parsing failed")
        raise HTTPException(status_code=422, detail=f"PDF parsing failed: {exc}")

    if not parsed_lots:
        raise HTTPException(
            status_code=422,
            detail="No lots found in the uploaded PDF. Check the file format.",
        )

    # Create the batch
    batch = ImportBatch(
        original_filename=file.filename or "upload.pdf",
        uploaded_by_id=current_user.id,
        status=ImportBatchStatus.reviewing,
        total_lots=len(parsed_lots),
    )
    db.add(batch)
    db.flush()

    # Build staged lots + parties
    for parsed_lot in parsed_lots:
        # Resolve SL# → lot.id  (uses strata_corporation_id=1 for BCS2611)
        lot = db.execute(
            select(Lot).where(Lot.strata_lot_number == parsed_lot.strata_lot_number)
        ).scalar_one_or_none()

        warnings = list(parsed_lot.parse_warnings)
        if lot is None:
            warnings.append(
                f"SL{parsed_lot.strata_lot_number}: strata lot number not found in database"
            )

        staged_lot = ImportStagedLot(
            batch_id=batch.id,
            lot_id=lot.id if lot else None,
            strata_lot_number=parsed_lot.strata_lot_number,
            unit_number=parsed_lot.unit_number,
            parse_warnings=warnings,
            raw_text=parsed_lot.raw_text,
        )
        db.add(staged_lot)
        db.flush()

        for pp in parsed_lot.parties:
            staged_party = ImportStagedParty(
                staged_lot_id=staged_lot.id,
                role=pp.role,
                full_name=pp.full_name,
                party_type=pp.party_type,
                is_property_manager=pp.is_property_manager,
                parent_name=pp.parent_name,
                mailing_address_line1=pp.mailing_address_line1,
                mailing_address_line2=pp.mailing_address_line2,
                mailing_city=pp.mailing_city,
                mailing_province=pp.mailing_province,
                mailing_postal_code=pp.mailing_postal_code,
                contact_methods=[
                    {"method_type": cm.method_type, "value": cm.value, "is_primary": cm.is_primary}
                    for cm in pp.contact_methods
                ],
                form_k_filed_date=pp.form_k_filed_date,
                notes=pp.notes,
            )
            db.add(staged_party)

    db.flush()

    # Run duplicate detection synchronously (fast enough for 245 lots)
    detect_duplicates_for_batch(db, batch)

    log_action(
        db,
        action="import",
        entity_type="import_batch",
        entity_id=batch.id,
        changes={"filename": file.filename, "lots_parsed": len(parsed_lots)},
        actor_id=current_user.id,
        actor_email=current_user.email,
        request=request,
    )
    db.commit()

    log.info("Import batch %d created: %d lots parsed", batch.id, len(parsed_lots))
    return ImportBatchOut.from_orm_batch(batch)


# ---------------------------------------------------------------------------
# List batches
# ---------------------------------------------------------------------------

@router.get("/batches", response_model=List[ImportBatchOut])
def list_batches(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    batches = db.execute(
        select(ImportBatch).order_by(ImportBatch.uploaded_at.desc()).limit(50)
    ).scalars().all()
    return [ImportBatchOut.from_orm_batch(b) for b in batches]


# ---------------------------------------------------------------------------
# Batch detail
# ---------------------------------------------------------------------------

@router.get("/batches/{batch_id}", response_model=ImportBatchOut)
def get_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    batch = _get_batch_or_404(db, batch_id)
    return ImportBatchOut.from_orm_batch(batch)


# ---------------------------------------------------------------------------
# Staged lots list
# ---------------------------------------------------------------------------

@router.get("/batches/{batch_id}/lots", response_model=PaginatedStagedLots)
def list_staged_lots(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    status_filter: Optional[str] = Query(None, alias="status"),
    issues_only: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=250),
):
    batch = _get_batch_or_404(db, batch_id)

    stmt = (
        select(ImportStagedLot)
        .where(ImportStagedLot.batch_id == batch_id)
        .options(selectinload(ImportStagedLot.parties))
        .order_by(ImportStagedLot.strata_lot_number)
    )

    if status_filter:
        try:
            stmt = stmt.where(ImportStagedLot.status == StagedLotStatus(status_filter))
        except ValueError:
            pass

    all_lots = db.execute(stmt).scalars().all()

    if issues_only:
        all_lots = [
            sl for sl in all_lots
            if sl.parse_warnings or any(
                sp.detected_duplicate_party_id and not sp.action
                for sp in sl.parties
            )
        ]

    total = len(all_lots)
    page_lots = all_lots[skip: skip + limit]

    pending = sum(1 for sl in batch.staged_lots if sl.status == StagedLotStatus.pending)
    confirmed = sum(1 for sl in batch.staged_lots if sl.status == StagedLotStatus.confirmed)
    skipped_count = sum(1 for sl in batch.staged_lots if sl.status == StagedLotStatus.skipped)
    with_issues = sum(
        1 for sl in batch.staged_lots
        if sl.parse_warnings or any(
            sp.detected_duplicate_party_id and not sp.action for sp in sl.parties
        )
    )

    items = [_serialize_staged_lot(db, sl) for sl in page_lots]

    return PaginatedStagedLots(
        items=items,
        total=total,
        lots_pending=pending,
        lots_confirmed=confirmed,
        lots_skipped=skipped_count,
        lots_with_issues=with_issues,
    )


# ---------------------------------------------------------------------------
# Single staged lot
# ---------------------------------------------------------------------------

@router.get("/batches/{batch_id}/lots/{lot_id}", response_model=StagedLotOut)
def get_staged_lot(
    batch_id: int,
    lot_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    sl = _get_staged_lot_or_404(db, batch_id, lot_id)
    return _serialize_staged_lot(db, sl)


# ---------------------------------------------------------------------------
# Set action on a staged party
# ---------------------------------------------------------------------------

@router.patch(
    "/batches/{batch_id}/lots/{lot_id}/parties/{party_id}",
    response_model=StagedPartyOut,
    dependencies=[Depends(require_csrf)],
)
def set_party_action(
    batch_id: int,
    lot_id: int,
    party_id: int,
    body: SetPartyActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    sl = _get_staged_lot_or_404(db, batch_id, lot_id)
    sp = db.execute(
        select(ImportStagedParty)
        .where(ImportStagedParty.id == party_id)
        .where(ImportStagedParty.staged_lot_id == lot_id)
    ).scalar_one_or_none()

    if not sp:
        raise HTTPException(status_code=404, detail="Staged party not found")
    if sl.status != StagedLotStatus.pending:
        raise HTTPException(status_code=400, detail="Lot is already confirmed or skipped")

    if body.action == "merge" and not body.merge_target_party_id:
        raise HTTPException(status_code=422, detail="merge requires merge_target_party_id")

    sp.action = body.action
    sp.merge_target_party_id = body.merge_target_party_id
    db.commit()

    return _serialize_staged_lot(db, sl).parties[
        next(i for i, p in enumerate(sl.parties) if p.id == party_id)
    ]


# ---------------------------------------------------------------------------
# Confirm lot
# ---------------------------------------------------------------------------

@router.post(
    "/batches/{batch_id}/lots/{lot_id}/confirm",
    response_model=ConfirmLotResponse,
    dependencies=[Depends(require_csrf)],
)
def confirm_staged_lot(
    batch_id: int,
    lot_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    sl = _get_staged_lot_or_404(db, batch_id, lot_id)

    if sl.status != StagedLotStatus.pending:
        raise HTTPException(
            status_code=400,
            detail=f"Lot is already {sl.status.value} — cannot confirm again",
        )

    # Check all parties have an action set (auto-assign "create" for undecided clean ones)
    for sp in sl.parties:
        if sp.action is None:
            if sp.detected_duplicate_party_id and sp.duplicate_confidence in ("high", "medium"):
                raise HTTPException(
                    status_code=422,
                    detail=f"Party '{sp.full_name}' has a {sp.duplicate_confidence.value}-confidence "
                           "duplicate — set an action (create / merge / skip) before confirming",
                )
            sp.action = "create"

    try:
        summary = confirm_lot(
            db, sl, actor_id=current_user.id, actor_email=current_user.email
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    batch = sl.batch
    completed = maybe_complete_batch(db, batch)
    db.commit()

    return ConfirmLotResponse(**summary, batch_completed=completed)


# ---------------------------------------------------------------------------
# Skip lot
# ---------------------------------------------------------------------------

@router.post(
    "/batches/{batch_id}/lots/{lot_id}/skip",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
)
def skip_staged_lot(
    batch_id: int,
    lot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_write),
):
    sl = _get_staged_lot_or_404(db, batch_id, lot_id)
    if sl.status != StagedLotStatus.pending:
        raise HTTPException(status_code=400, detail="Lot is already processed")
    skip_lot(db, sl, actor_id=current_user.id, actor_email=current_user.email)
    maybe_complete_batch(db, sl.batch)
    db.commit()


# ---------------------------------------------------------------------------
# Re-import diff
# ---------------------------------------------------------------------------

@router.get("/batches/{batch_id}/diff")
def get_batch_diff(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    For each pending lot in the batch, return a diff of staged vs current live assignments.
    Only meaningful on re-imports (when lots already have current assignments).
    """
    batch = _get_batch_or_404(db, batch_id)
    result = []
    for sl in batch.staged_lots:
        if sl.status != StagedLotStatus.pending:
            continue
        diff = compute_diff(db, sl)
        if diff["new"] or diff["departed"]:
            result.append({
                "staged_lot_id": sl.id,
                "strata_lot_number": sl.strata_lot_number,
                "unit_number": sl.unit_number,
                **diff,
            })
    return {"changed_lots": result, "total_changed": len(result)}
