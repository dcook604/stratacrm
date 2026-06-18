"""
Incident evidence package PDF generator using WeasyPrint.

Generates a court/dispute-ready PDF: full descriptions, complete notes
timeline, embedded image thumbnails, and a certification statement.
"""

import base64
import html
import os
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import structlog
from weasyprint import HTML

from app.utils.media import thumbnail_path_for

log = structlog.get_logger()

_TEMPLATE_PATH = Path(__file__).parent / "templates" / "incident_evidence.html"


def _e(value: Optional[str]) -> str:
    if value is None:
        return ""
    return html.escape(str(value))


def _fmt_date(d: Optional[date]) -> str:
    if d is None:
        return "—"
    return d.strftime("%B %d, %Y")


def _fmt_dt(dt: Optional[datetime]) -> str:
    if dt is None:
        return "—"
    return dt.strftime("%B %d, %Y at %I:%M %p")


def _load_image_b64(storage_path: str) -> tuple[str, str] | None:
    """Return (mime_type, base64_data) using thumbnail if available, else original."""
    thumb = thumbnail_path_for(storage_path)
    path_to_use = thumb if os.path.exists(thumb) else storage_path
    if not os.path.exists(path_to_use):
        return None
    try:
        with open(path_to_use, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        ext = Path(path_to_use).suffix.lower()
        if ext == ".png":
            mime = "image/png"
        elif ext == ".gif":
            mime = "image/gif"
        elif ext == ".webp":
            mime = "image/webp"
        else:
            mime = "image/jpeg"
        return mime, data
    except OSError:
        return None


def _build_attachment_cell(doc: dict) -> str:
    mime = doc.get("mime_type") or ""
    caption = doc.get("caption") or doc.get("original_filename") or "Attachment"
    tags = doc.get("tags") or ""
    uploaded_at = doc.get("uploaded_at")
    date_str = _fmt_dt(uploaded_at) if uploaded_at else ""

    tag_items = ""
    if tags:
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]
        tag_items = " ".join(f'<span class="att-tag">{_e(t)}</span>' for t in tag_list)

    if mime.startswith("image/") and not doc.get("is_processing"):
        storage_path = doc.get("storage_path") or ""
        img_result = _load_image_b64(storage_path) if storage_path else None
        if img_result:
            img_mime, img_data = img_result
            media_html = (
                f'<img src="data:{img_mime};base64,{img_data}" '
                f'class="att-img" alt="{_e(caption)}" />'
            )
        else:
            media_html = '<div class="att-missing">Image unavailable</div>'
    elif mime.startswith("video/"):
        filename = _e(doc.get("original_filename") or "video file")
        media_html = f'<div class="att-video-note">&#9654; Video: {filename}<br/>(retrieve from system)</div>'
    else:
        media_html = '<div class="att-file-icon">&#128196;</div>'

    return f"""
<td class="att-cell">
  {media_html}
  <div class="att-caption">{_e(caption)}</div>
  {f'<div class="att-tags">{tag_items}</div>' if tag_items else ""}
  <div class="att-date">{date_str}</div>
</td>"""


def _build_attachments_section(docs: list[dict]) -> str:
    visible = [d for d in docs if not d.get("is_processing")]
    if not visible:
        return '<p class="empty-state">No attachments.</p>'

    # Render in a 2-column table
    rows = ""
    for i in range(0, len(visible), 2):
        left = _build_attachment_cell(visible[i])
        right = _build_attachment_cell(visible[i + 1]) if i + 1 < len(visible) else "<td></td>"
        rows += f"<tr>{left}{right}</tr>"

    return f'<table class="att-table"><tbody>{rows}</tbody></table>'


def _build_notes_section(notes: list[dict]) -> str:
    if not notes:
        return '<p class="empty-state">No updates recorded.</p>'
    items = ""
    for n in notes:
        source = n.get("source") or "manual"
        source_badge = '<span class="note-email-badge">Email</span>' if source == "email" else ""
        author = _e(n.get("author_name") or n.get("author_email") or "Unknown")
        created_at = n.get("created_at")
        date_str = _fmt_dt(created_at) if created_at else ""
        content = _e(n.get("content") or "")
        items += f"""
<div class="note-item">
  <div class="note-meta">{source_badge}<span class="note-author">{author}</span><span class="note-date">{date_str}</span></div>
  <div class="note-body">{content}</div>
</div>"""
    return items


def _build_incident_card(inc: dict, idx: int, total: int, include_notes: bool, include_attachments: bool) -> str:
    reference = _e(inc.get("reference") or f"#{idx + 1}")
    status = inc.get("status") or "open"
    status_label = status.replace("_", " ").title()
    status_class = f"status-{status}"

    incident_date = inc.get("incident_date")
    date_str = _fmt_dt(incident_date) if incident_date else "—"
    category = _e(inc.get("category") or "—")
    location = _e(inc.get("location_label") or "—")
    reported_by = inc.get("reported_by") or ""
    reporter_email = inc.get("reporter_email") or ""
    description = _e(inc.get("description") or "")
    resolution = inc.get("resolution") or ""

    reporter_str = ""
    if reported_by or reporter_email:
        if reported_by and reporter_email:
            reporter_str = f"{_e(reported_by)} ({_e(reporter_email)})"
        else:
            reporter_str = _e(reported_by or reporter_email)

    resolution_html = ""
    if resolution:
        resolution_html = f"""
<div class="inc-section">
  <div class="inc-section-label">Resolution</div>
  <div class="inc-resolution">{_e(resolution)}</div>
</div>"""

    notes = inc.get("notes") or []
    notes_html = ""
    if include_notes:
        notes_html = f"""
<div class="inc-section">
  <div class="inc-section-label">Timeline / Updates ({len(notes)})</div>
  <div class="notes-list">{_build_notes_section(notes)}</div>
</div>"""

    attachments_html = ""
    if include_attachments:
        docs = inc.get("documents") or []
        visible_count = len([d for d in docs if not d.get("is_processing")])
        attachments_html = f"""
<div class="inc-section">
  <div class="inc-section-label">Attachments ({visible_count})</div>
  {_build_attachments_section(docs)}
</div>"""

    reporter_row = (
        f'<tr><td class="field-label">Reported By:</td><td class="field-value">{reporter_str}</td></tr>'
        if reporter_str else ""
    )

    return f"""
<div class="incident-card">
  <div class="inc-header">
    <span class="inc-ref">{reference}</span>
    <span class="status-badge {status_class}">{status_label}</span>
    <span class="inc-counter">Incident {idx + 1} of {total}</span>
  </div>
  <table class="field-table">
    <tr><td class="field-label">Date / Time:</td><td class="field-value">{date_str}</td></tr>
    <tr><td class="field-label">Category:</td><td class="field-value">{category}</td></tr>
    <tr><td class="field-label">Location:</td><td class="field-value">{location}</td></tr>
    {reporter_row}
  </table>
  <div class="inc-section">
    <div class="inc-section-label">Description</div>
    <div class="inc-description">{description}</div>
  </div>
  {resolution_html}
  {notes_html}
  {attachments_html}
</div>"""


def render_incident_evidence_pdf(
    corp_name: str,
    strata_plan: str,
    corp_address: str,
    strata_lot_number: int,
    unit_number: Optional[str],
    parties: list[dict],
    incidents: list[dict],
    generated_by_email: str,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    category_filter: Optional[str] = None,
    include_notes: bool = True,
    include_attachments: bool = True,
) -> bytes:
    now = datetime.now()
    generated_date = now.strftime("%B %d, %Y at %I:%M %p")

    lot_label = f"SL{strata_lot_number}"
    if unit_number:
        lot_label += f" / Unit {unit_number}"

    if from_date and to_date:
        date_range = f"{_fmt_date(from_date)} to {_fmt_date(to_date)}"
    elif from_date:
        date_range = f"From {_fmt_date(from_date)}"
    elif to_date:
        date_range = f"Up to {_fmt_date(to_date)}"
    else:
        date_range = "All dates on record"

    category_str = _e(category_filter) if category_filter else "All categories"

    if parties:
        tags = "".join(
            f'<span class="party-tag"><span class="party-role">{_e(p["role"].replace("_", " ").title())}:</span> {_e(p["full_name"])}</span>'
            for p in parties
        )
        parties_html = f'<div class="parties-list">{tags}</div>'
    else:
        parties_html = '<p class="empty-state">No parties currently assigned.</p>'

    total = len(incidents)
    if incidents:
        incidents_html = "".join(
            _build_incident_card(inc, idx, total, include_notes, include_attachments)
            for idx, inc in enumerate(incidents)
        )
    else:
        incidents_html = '<p class="empty-state">No incidents found matching the selected criteria.</p>'

    template = _TEMPLATE_PATH.read_text(encoding="utf-8")
    replacements = {
        "{{CORP_NAME}}": _e(corp_name),
        "{{STRATA_PLAN}}": _e(strata_plan),
        "{{CORP_ADDRESS}}": _e(corp_address),
        "{{GENERATED_DATE}}": generated_date,
        "{{GENERATED_BY}}": _e(generated_by_email),
        "{{LOT_LABEL}}": _e(lot_label),
        "{{DATE_RANGE}}": date_range,
        "{{CATEGORY_FILTER}}": category_str,
        "{{TOTAL_INCIDENTS}}": str(total),
        "{{PARTIES_SECTION}}": parties_html,
        "{{INCIDENTS_CONTENT}}": incidents_html,
    }
    report_html = template
    for placeholder, value in replacements.items():
        report_html = report_html.replace(placeholder, value)

    pdf_bytes = HTML(string=report_html, base_url=str(_TEMPLATE_PATH.parent)).write_pdf()
    log.info("incident_evidence_pdf_generated", sl=strata_lot_number, count=total, bytes=len(pdf_bytes))
    return pdf_bytes
