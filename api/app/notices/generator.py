"""
Notice PDF generator using WeasyPrint.

Renders a formal s.135 bylaw contravention notice as PDF bytes.
All user-supplied strings are HTML-escaped before insertion.
"""

import os
import html
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Optional

import structlog
from weasyprint import HTML

log = structlog.get_logger()

_TEMPLATE_PATH = Path(__file__).parent / "templates" / "notice.html"


def _e(value: Optional[str]) -> str:
    """HTML-escape a string, returning empty string for None."""
    if value is None:
        return ""
    return html.escape(str(value))


def _fmt_money(amount: Optional[Decimal]) -> str:
    if amount is None:
        return "—"
    return f"${amount:,.2f}"


def _fmt_date(d: Optional[date]) -> str:
    if d is None:
        return "—"
    return d.strftime("%B %d, %Y")


def render_notice_pdf(
    infraction_id: int,
    corp_name: str,
    strata_plan: str,
    corp_address: str,
    party_name: str,
    party_address_lines: list[str],
    strata_lot_number: int,
    unit_number: Optional[str],
    bylaw_number: str,
    bylaw_section: Optional[str],
    bylaw_title: str,
    bylaw_full_text: str,
    complaint_date: date,
    description: str,
    fine_schedules: list[dict],   # list of {occurrence_number, fine_amount, continuing_contravention_amount}
    notice_date: Optional[date] = None,
) -> bytes:
    """
    Render a bylaw contravention notice to PDF bytes.

    fine_schedules: list of dicts with keys occurrence_number (int), fine_amount (Decimal),
                    continuing_contravention_amount (Decimal|None), max_per_week (Decimal|None).
    """
    if notice_date is None:
        notice_date = date.today()

    response_deadline = notice_date + timedelta(days=14)

    template = _TEMPLATE_PATH.read_text(encoding="utf-8")

    # Build address block
    address_lines_html = "".join(
        f"<p>{_e(line)}</p>" for line in party_address_lines if line
    )

    # Unit suffix
    unit_suffix = f", Unit {_e(unit_number)}" if unit_number else ""

    # Section suffix in bylaw reference
    section_suffix = f", Section {_e(bylaw_section)}" if bylaw_section else ""

    # Fine schedule section
    fine_section = _build_fine_section(fine_schedules)

    replacements = {
        "{{CORP_NAME}}": _e(corp_name),
        "{{STRATA_PLAN}}": _e(strata_plan),
        "{{CORP_ADDRESS}}": _e(corp_address),
        "{{NOTICE_DATE}}": _e(_fmt_date(notice_date)),
        "{{PARTY_NAME}}": _e(party_name),
        "{{PARTY_ADDRESS_BLOCK}}": address_lines_html,
        "{{STRATA_LOT_NUMBER}}": _e(str(strata_lot_number)),
        "{{UNIT_SUFFIX}}": unit_suffix,
        "{{BYLAW_NUMBER}}": _e(bylaw_number),
        "{{SECTION_SUFFIX}}": section_suffix,
        "{{BYLAW_TITLE}}": _e(bylaw_title),
        "{{BYLAW_FULL_TEXT}}": _e(bylaw_full_text),
        "{{COMPLAINT_DATE}}": _e(_fmt_date(complaint_date)),
        "{{DESCRIPTION}}": _e(description),
        "{{RESPONSE_DEADLINE}}": _e(_fmt_date(response_deadline)),
        "{{FINE_SCHEDULE_SECTION}}": fine_section,
        "{{INFRACTION_ID}}": _e(str(infraction_id)),
    }

    notice_html = template
    for placeholder, value in replacements.items():
        notice_html = notice_html.replace(placeholder, value)

    pdf_bytes = HTML(string=notice_html, base_url=str(_TEMPLATE_PATH.parent)).write_pdf()

    log.info("notice_pdf_generated", infraction_id=infraction_id, bytes=len(pdf_bytes))
    return pdf_bytes


def _build_fine_section(fine_schedules: list[dict]) -> str:
    if not fine_schedules:
        return ""

    def _occ_label(n: int) -> str:
        if n == 1:
            return "First contravention"
        if n == 2:
            return "Second contravention"
        if n == 99:
            return "Third and subsequent contraventions"
        return f"Contravention #{n}"

    rows = ""
    for fs in sorted(fine_schedules, key=lambda x: x["occurrence_number"]):
        cont = ""
        if fs.get("continuing_contravention_amount"):
            cont = f"<br><small>Continuing: {_fmt_money(fs['continuing_contravention_amount'])}/day"
            if fs.get("max_per_week"):
                cont += f" (max {_fmt_money(fs['max_per_week'])}/week)"
            cont += "</small>"
        rows += (
            f"<tr>"
            f"<td>{_occ_label(fs['occurrence_number'])}</td>"
            f"<td>{_fmt_money(fs['fine_amount'])}{cont}</td>"
            f"</tr>"
        )

    return f"""
<h2>Applicable Fine Schedule</h2>
<p>
  Should the Strata Council determine that a contravention occurred and no satisfactory
  explanation is received, the following fines may be imposed in accordance with the
  bylaw fine schedule:
</p>
<table class="fine-table">
  <thead>
    <tr>
      <th>Occurrence</th>
      <th>Fine Amount</th>
    </tr>
  </thead>
  <tbody>
    {rows}
  </tbody>
</table>
"""
