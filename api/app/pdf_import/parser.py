"""
Owner-list PDF parser for BC strata corporations.

Entry point
-----------
parse_owner_list_pdf(pdf_bytes)  -> list[ParsedLot]

Expected PDF format
-------------------
A wide relational table split across 4 column groups, each group spanning
multiple pages.  Every column group starts with a header row that identifies
the group:

  Group 1  sl_number | unit | contact_type
  Group 2  name
  Group 3  address | phone_home | phone_cell
  Group 4  phone_work | email

All groups contain the same number of data rows in the same order, so they
are joined by row index to reconstruct one record per person.  Records are
then grouped by (sl_number, unit) to produce ParsedLot objects.
"""

from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes (public API)
# ---------------------------------------------------------------------------

@dataclass
class ParsedContactMethod:
    method_type: str   # home_phone | cell_phone | work_phone | email
    value: str
    is_primary: bool = False


@dataclass
class ParsedParty:
    full_name: str
    role: str
    party_type: str = "individual"
    is_property_manager: bool = False
    parent_name: Optional[str] = None
    mailing_address_line1: Optional[str] = None
    mailing_address_line2: Optional[str] = None
    mailing_city: Optional[str] = None
    mailing_province: Optional[str] = None
    mailing_postal_code: Optional[str] = None
    contact_methods: list[ParsedContactMethod] = field(default_factory=list)
    form_k_filed_date: Optional[date] = None
    notes: Optional[str] = None


@dataclass
class ParsedLot:
    strata_lot_number: int
    unit_number: Optional[str]
    parties: list[ParsedParty] = field(default_factory=list)
    parse_warnings: list[str] = field(default_factory=list)
    raw_text: str = ""


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_CONTACT_TYPE_MAP: dict[str, str] = {
    "owner absentee":               "owner_absentee",
    "owner occupant":               "owner_occupant",
    "tenant":                       "tenant",
    "emergency contact":            "emergency_contact",
    "emergency contact/key holder": "emergency_contact",
    "key holder":                   "key_holder",
    "agent":                        "agent",
    "property manager":             "property_manager_of_record",
    "property manager of record":   "property_manager_of_record",
}

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
_PHONE_RE = re.compile(r"(\d{3})\s*[-.]?\s*(\d{3})\s*[-.]?\s*(\d{4})")
_POSTAL_CA = re.compile(r"\b([A-Z]\d[A-Z]\s?\d[A-Z]\d)\b", re.IGNORECASE)
_PROVINCE_RE = re.compile(
    r"\b(BC|AB|SK|MB|ON|QC|NB|NS|PE|NL|NT|YT|NU"
    r"|British Columbia|Alberta|Ontario|Quebec)\b",
    re.IGNORECASE,
)
_PROVINCE_MAP = {
    "british columbia": "BC", "alberta": "AB", "ontario": "ON",
    "quebec": "QC", "saskatchewan": "SK", "manitoba": "MB",
}

# Column group header detection
_HDR_GROUP1 = re.compile(r"sl.?number|sl\s+unit|strata.?lot", re.IGNORECASE)
_HDR_GROUP3 = re.compile(r"\baddress\b", re.IGNORECASE)
_HDR_GROUP4 = re.compile(r"phone.?work|phone_work", re.IGNORECASE)
# Group 2 header is just "name" — detected after ruling out others


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_owner_list_pdf(pdf_bytes: bytes) -> list[ParsedLot]:
    """Parse an owner-list PDF and return structured lot records."""
    try:
        import pdfplumber
    except ImportError:
        raise RuntimeError("pdfplumber is required: pip install pdfplumber")

    groups: dict[int, list[dict]] = {1: [], 2: [], 3: [], 4: []}

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            _process_page(page, groups)

    g1, g2, g3, g4 = groups[1], groups[2], groups[3], groups[4]
    log.info("PDF column groups: g1=%d g2=%d g3=%d g4=%d", len(g1), len(g2), len(g3), len(g4))

    n = max(len(g1), len(g2), len(g3), len(g4))
    if n == 0:
        log.warning("PDF parser: no data rows found")
        return []

    merged: list[dict] = []
    for i in range(n):
        r: dict = {}
        for grp in (g1, g2, g3, g4):
            if i < len(grp):
                r.update(grp[i])
        merged.append(r)

    return _build_lots(merged)


# ---------------------------------------------------------------------------
# Page processing
# ---------------------------------------------------------------------------

def _process_page(page, groups: dict[int, list[dict]]) -> None:
    """Extract rows from one PDF page into the appropriate column group."""
    tables = page.extract_tables({"vertical_strategy": "lines", "horizontal_strategy": "lines"})
    if not tables:
        tables = page.extract_tables()

    if tables:
        for table in tables:
            _process_table(table, groups, page.page_number)
    else:
        _process_page_text(page, groups)


def _process_table(table: list[list], groups: dict[int, list[dict]], page_num: int) -> None:
    """Detect column group of a table and extract its data rows."""
    if not table:
        return

    # Find first populated row = header
    header_idx = None
    for idx, row in enumerate(table):
        if any(str(c or "").strip() for c in row):
            header_idx = idx
            break
    if header_idx is None:
        return

    header_cells = [str(c or "").strip() for c in table[header_idx]]
    header_joined = " ".join(header_cells).strip()

    grp_num, col_map = _detect_group(header_joined, header_cells)
    if grp_num is None:
        log.debug("Page %d: unrecognized header %r", page_num, header_joined[:80])
        return

    target = groups[grp_num]
    for row in table[header_idx + 1:]:
        cells = [str(c or "").strip() for c in row]
        if not any(cells):
            continue
        record = {col_map[i]: cells[i] for i in col_map if i < len(cells)}
        if record:
            target.append(record)


def _detect_group(
    header_joined: str,
    header_cells: list[str],
) -> tuple[Optional[int], dict[int, str]]:
    """
    Return (group_number, col_index→field_name) for a table header row.
    Returns (None, {}) if the header is not recognized.
    """
    if _HDR_GROUP1.search(header_joined):
        return 1, _build_col_map(header_cells, {
            "sl_number":    ["sl_number", "sl", "strata lot", "lot", "sl number"],
            "unit":         ["unit"],
            "contact_type": ["contact_type", "contact type", "type"],
        })

    if _HDR_GROUP3.search(header_joined):
        return 3, _build_col_map(header_cells, {
            "address":    ["address", "mailing address", "mailing_address"],
            "phone_home": ["phone_home", "phone home", "home", "home phone"],
            "phone_cell": ["phone_cell", "phone cell", "cell", "cell phone", "mobile"],
        })

    if _HDR_GROUP4.search(header_joined):
        return 4, _build_col_map(header_cells, {
            "phone_work": ["phone_work", "phone work", "work", "work phone"],
            "email":      ["email", "e-mail"],
        })

    # Group 2: must contain "name" and not match others
    if any(c.lower() == "name" or c.lower().startswith("name") for c in header_cells if c):
        return 2, _build_col_map(header_cells, {"name": ["name"]})

    return None, {}


def _process_page_text(page, groups: dict[int, list[dict]]) -> None:
    """
    Fallback text extraction when pdfplumber finds no table lines.
    Groups words into rows by y-position, then detects column group from header.
    """
    words = page.extract_words(x_tolerance=5, y_tolerance=3)
    if not words:
        return

    # Cluster words into rows by top position
    rows_by_y: dict[int, list] = {}
    for w in words:
        y_key = round(float(w["top"]) / 4) * 4
        rows_by_y.setdefault(y_key, []).append(w)

    text_rows: list[str] = []
    for y_key in sorted(rows_by_y):
        row_words = sorted(rows_by_y[y_key], key=lambda w: float(w["x0"]))
        text_rows.append(" ".join(w["text"] for w in row_words))

    if not text_rows:
        return

    header = text_rows[0]
    header_cells = header.split()
    grp_num, _ = _detect_group(header, header_cells)
    if grp_num is None:
        return

    target = groups[grp_num]
    for line in text_rows[1:]:
        line = line.strip()
        if not line:
            continue
        record = _parse_text_line_for_group(line, grp_num)
        if record:
            target.append(record)


def _parse_text_line_for_group(line: str, grp_num: int) -> Optional[dict]:
    """Parse a whitespace-separated text line based on its column group number."""
    parts = line.split()
    if not parts:
        return None

    if grp_num == 1:
        if len(parts) < 3:
            return None
        try:
            int(parts[0])
        except ValueError:
            return None
        return {"sl_number": parts[0], "unit": parts[1], "contact_type": " ".join(parts[2:])}

    if grp_num == 2:
        return {"name": line}

    if grp_num == 3:
        phones = _PHONE_RE.findall(line)
        addr = _PHONE_RE.sub("", line).strip()
        return {
            "address":    addr,
            "phone_home": f"{phones[0][0]}-{phones[0][1]}-{phones[0][2]}" if len(phones) > 0 else "",
            "phone_cell": f"{phones[1][0]}-{phones[1][1]}-{phones[1][2]}" if len(phones) > 1 else "",
        }

    if grp_num == 4:
        email_m = _EMAIL_RE.search(line)
        phone_m = _PHONE_RE.search(line)
        return {
            "phone_work": f"{phone_m.group(1)}-{phone_m.group(2)}-{phone_m.group(3)}" if phone_m else "",
            "email":      email_m.group(0).lower() if email_m else "",
        }

    return None


# ---------------------------------------------------------------------------
# Row assembly
# ---------------------------------------------------------------------------

def _build_lots(rows: list[dict]) -> list[ParsedLot]:
    """Group merged rows by (sl_number, unit) → ParsedLot objects."""
    lots: dict[tuple, ParsedLot] = {}
    warnings_map: dict[tuple, list[str]] = {}

    for i, row in enumerate(rows):
        sl_raw = row.get("sl_number", "").strip()
        unit_raw = row.get("unit", "").strip()
        name_raw = row.get("name", "").strip()
        contact_type_raw = row.get("contact_type", "").strip()

        if not sl_raw:
            continue
        try:
            sl_number = int(sl_raw)
        except ValueError:
            log.debug("Row %d: non-integer sl_number %r, skipping", i, sl_raw)
            continue

        unit_number = unit_raw.upper() if unit_raw else None
        key = (sl_number, unit_number)

        if key not in lots:
            lots[key] = ParsedLot(strata_lot_number=sl_number, unit_number=unit_number)
            warnings_map[key] = []

        if not name_raw:
            warnings_map[key].append(f"SL{sl_number}: row {i} has no name")
            continue

        role = _map_contact_type(contact_type_raw, sl_number)

        contact_methods: list[ParsedContactMethod] = []
        for field_name, method_type in [
            ("phone_home", "home_phone"),
            ("phone_cell", "cell_phone"),
            ("phone_work", "work_phone"),
        ]:
            raw_val = row.get(field_name, "").strip()
            if raw_val:
                norm = _normalize_phone(raw_val)
                if norm:
                    contact_methods.append(ParsedContactMethod(method_type, norm))

        email_raw = row.get("email", "").strip()
        if email_raw:
            em = _EMAIL_RE.search(email_raw)
            if em:
                contact_methods.append(ParsedContactMethod("email", em.group(0).lower()))

        _set_primary_flags(contact_methods)

        city, province, postal, addr1, addr2 = _parse_address_string(
            row.get("address", "").strip()
        )

        party_type = "individual"
        if re.search(
            r"\b(ltd\.?|inc\.?|corp\.?|limited|incorporated|holdings|properties"
            r"|management|services|enterprises|group)\b",
            name_raw, re.IGNORECASE,
        ):
            party_type = "corporation"

        lots[key].parties.append(ParsedParty(
            full_name=name_raw,
            role=role,
            party_type=party_type,
            mailing_address_line1=addr1,
            mailing_address_line2=addr2,
            mailing_city=city,
            mailing_province=province,
            mailing_postal_code=postal,
            contact_methods=contact_methods,
        ))

    for key, lot in lots.items():
        lot.parse_warnings = warnings_map[key]

    result = list(lots.values())
    log.info("PDF parser: %d lots from %d rows", len(result), len(rows))
    return result


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def _build_col_map(header_cells: list[str], field_aliases: dict[str, list[str]]) -> dict[int, str]:
    """Map column index → field name using alias matching against header cells."""
    col_map: dict[int, str] = {}
    for col_idx, cell in enumerate(header_cells):
        norm = cell.lower().strip()
        for field_name, aliases in field_aliases.items():
            if any(norm == a or a in norm for a in aliases):
                if col_idx not in col_map:
                    col_map[col_idx] = field_name
                break
    # Positional fallback when no alias matched
    if not col_map:
        for i, fname in enumerate(field_aliases):
            col_map[i] = fname
    return col_map


def _map_contact_type(raw: str, sl_number: int) -> str:
    key = raw.strip().lower()
    role = _CONTACT_TYPE_MAP.get(key)
    if role:
        return role
    if "owner" in key and "occupant" in key:
        return "owner_occupant"
    if "owner" in key:
        return "owner_absentee"
    if "tenant" in key:
        return "tenant"
    if "emergency" in key:
        return "emergency_contact"
    if "key" in key:
        return "key_holder"
    if "agent" in key:
        return "agent"
    if "manager" in key:
        return "property_manager_of_record"
    log.warning("SL%d: unknown contact_type %r, defaulting to owner_absentee", sl_number, raw)
    return "owner_absentee"


def _normalize_phone(raw: str) -> Optional[str]:
    m = _PHONE_RE.search(raw)
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None


def _parse_address_string(
    raw: str,
) -> tuple[Optional[str], Optional[str], Optional[str], Optional[str], Optional[str]]:
    """Parse an address string into (city, province, postal, addr1, addr2)."""
    if not raw:
        return None, None, None, None, None

    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    if not lines:
        return None, None, None, None, None

    city: Optional[str] = None
    province: Optional[str] = None
    postal: Optional[str] = None
    city_line_idx: Optional[int] = None

    for i, ln in enumerate(lines):
        pm = _PROVINCE_RE.search(ln)
        if pm:
            city_line_idx = i
            raw_prov = pm.group(0)
            province = _PROVINCE_MAP.get(raw_prov.lower(), raw_prov.upper())
            postal_m = _POSTAL_CA.search(ln)
            if postal_m:
                postal = postal_m.group(1).upper().replace(" ", "")
            city_raw = ln[: pm.start()].strip().rstrip(",").strip()
            if city_raw:
                city = city_raw
            break

    street_lines = [ln for i, ln in enumerate(lines) if i != city_line_idx]
    addr1 = street_lines[0] if street_lines else None
    addr2 = ", ".join(street_lines[1:]) if len(street_lines) > 1 else None

    return city, province, postal, addr1, addr2


def _set_primary_flags(methods: list[ParsedContactMethod]) -> None:
    seen: set[str] = set()
    for cm in methods:
        if cm.method_type not in seen:
            cm.is_primary = True
            seen.add(cm.method_type)
