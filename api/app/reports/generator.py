"""
Lot report PDF generator using WeasyPrint.

Renders a professional summary report for a single lot including
party info, infractions, incidents, and issues.
"""

import html
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Optional

import structlog
from weasyprint import HTML

log = structlog.get_logger()

_TEMPLATE_PATH = Path(__file__).parent / "templates" / "lot_report.html"


def _e(value: Optional[str]) -> str:
    """HTML-escape a string, returning empty string for None."""
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
    return dt.strftime("%B %d, %Y")


def _fmt_money(amount: Optional[Decimal]) -> str:
    if amount is None:
        return "—"
    return f"${amount:,.2f}"


def _status_class(status: str) -> str:
    """Map a status value to its CSS class."""
    return f"status-{status}"


def _build_parties_section(parties: list[dict]) -> str:
    """Build the parties display section."""
    if not parties:
        return '<p class="empty-state">No parties currently assigned.</p>'

    parts = ""
    for p in parties:
        role_label = p["role"].replace("_", " ").title()
        parts += f'<span class="party-tag"><span class="party-role">{_e(role_label)}:</span> {_e(p["full_name"])}</span> '
    return f'<p>{parts}</p>'


def _build_infractions_table(infractions: list[dict]) -> str:
    if not infractions:
        return '<p class="empty-state">No infractions recorded for this lot.</p>'

    rows = ""
    for i in infractions:
        status_class = _status_class(i["status"])
        status_label = i["status"].replace("_", " ").title()
        rows += (
            f"<tr>"
            f"<td>{_e(i.get('party_name') or '—')}</td>"
            f"<td>{_e(i['bylaw_number'])}</td>"
            f"<td>{_fmt_date(i.get('complaint_received_date'))}</td>"
            f"<td>{_fmt_money(i.get('assessed_fine_amount'))}</td>"
            f'<td><span class="status-badge {status_class}">{status_label}</span></td>'
            f"</tr>"
        )

    return f"""
<table>
  <thead>
    <tr>
      <th>Party</th>
      <th>Bylaw</th>
      <th>Complaint Date</th>
      <th>Fine</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    {rows}
  </tbody>
</table>
"""


def _build_incidents_table(incidents: list[dict]) -> str:
    if not incidents:
        return '<p class="empty-state">No incidents recorded for this lot.</p>'

    rows = ""
    for i in incidents:
        status_class = _status_class(i["status"])
        status_label = i["status"].replace("_", " ").title()
        desc = i.get("description") or ""
        if len(desc) > 60:
            desc = desc[:57] + "..."
        rows += (
            f"<tr>"
            f"<td>{_e(i['category'])}</td>"
            f"<td>{_e(_fmt_dt(i.get('incident_date')))}</td>"
            f"<td>{_e(desc)}</td>"
            f'<td><span class="status-badge {status_class}">{status_label}</span></td>'
            f"</tr>"
        )

    return f"""
<table>
  <thead>
    <tr>
      <th>Category</th>
      <th>Date</th>
      <th>Description</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    {rows}
  </tbody>
</table>
"""


def _build_issues_table(issues: list[dict]) -> str:
    if not issues:
        return '<p class="empty-state">No issues recorded for this lot.</p>'

    rows = ""
    for i in issues:
        status_class = _status_class(i["status"])
        status_label = i["status"].replace("_", " ").title()
        priority_label = i.get("priority", "").title()
        due = _fmt_date(i.get("due_date")) if i.get("due_date") else "—"
        rows += (
            f"<tr>"
            f"<td>{_e(i['title'])}</td>"
            f"<td>{priority_label}</td>"
            f"<td>{due}</td>"
            f"<td>{_e(i.get('assignee_name') or '—')}</td>"
            f'<td><span class="status-badge {status_class}">{status_label}</span></td>'
            f"</tr>"
        )

    return f"""
<table>
  <thead>
    <tr>
      <th>Title</th>
      <th>Priority</th>
      <th>Due Date</th>
      <th>Assignee</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    {rows}
  </tbody>
</table>
"""


def render_lot_report_pdf(
    corp_name: str,
    strata_plan: str,
    corp_address: str,
    strata_lot_number: int,
    unit_number: Optional[str],
    square_feet: Optional[Decimal],
    parking_stalls: Optional[str],
    storage_lockers: Optional[str],
    parties: list[dict],
    open_infractions: int,
    total_infractions: int,
    open_incidents: int,
    total_incidents: int,
    open_issues: int,
    total_issues: int,
    infractions: list[dict],
    incidents: list[dict],
    issues: list[dict],
) -> bytes:
    """Render a lot summary report to PDF bytes."""

    now = datetime.now()
    generated_date = now.strftime("%B %d, %Y at %I:%M %p")

    # Build parking/storage string
    pk_storage = _e(parking_stalls or "")
    if storage_lockers:
        if pk_storage:
            pk_storage += f" / {_e(storage_lockers)}"
        else:
            pk_storage = _e(storage_lockers)
    if not pk_storage:
        pk_storage = "—"

    unit_str = _e(unit_number) if unit_number else "—"
    sqft_str = f"{square_feet:,.0f} sq ft" if square_feet else "—"

    template = _TEMPLATE_PATH.read_text(encoding="utf-8")

    replacements = {
        "{{CORP_NAME}}": _e(corp_name),
        "{{STRATA_PLAN}}": _e(strata_plan),
        "{{CORP_ADDRESS}}": _e(corp_address),
        "{{GENERATED_DATE}}": generated_date,
        "{{SL_NUMBER}}": str(strata_lot_number),
        "{{UNIT_NUMBER}}": unit_str,
        "{{SQUARE_FEET}}": sqft_str,
        "{{PARKING_STORAGE}}": pk_storage,
        "{{PARTIES_SECTION}}": _build_parties_section(parties),
        "{{OPEN_INFRACTIONS}}": str(open_infractions),
        "{{TOTAL_INFRACTIONS}}": str(total_infractions),
        "{{OPEN_INCIDENTS}}": str(open_incidents),
        "{{TOTAL_INCIDENTS}}": str(total_incidents),
        "{{OPEN_ISSUES}}": str(open_issues),
        "{{TOTAL_ISSUES}}": str(total_issues),
        "{{INFRACTIONS_TABLE}}": _build_infractions_table(infractions),
        "{{INCIDENTS_TABLE}}": _build_incidents_table(incidents),
        "{{ISSUES_TABLE}}": _build_issues_table(issues),
    }

    report_html = template
    for placeholder, value in replacements.items():
        report_html = report_html.replace(placeholder, value)

    pdf_bytes = HTML(string=report_html, base_url=str(_TEMPLATE_PATH.parent)).write_pdf()

    log.info("lot_report_pdf_generated", sl=strata_lot_number, bytes=len(pdf_bytes))
    return pdf_bytes
