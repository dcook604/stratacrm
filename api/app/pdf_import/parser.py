"""
Owner-list PDF parser for BC strata corporations.

Entry points
------------
parse_owner_list_pdf(pdf_bytes)  -> list[ParsedLot]   (reads PDF binary)
parse_owner_list_text(text)      -> list[ParsedLot]   (testable from plain text)

Expected PDF format (as extracted by pdfplumber)
-------------------------------------------------
Each lot block looks roughly like:

    SL 10    UNIT 0110
    OWNER (ABSENTEE)
    Kim, Hyosook
    #2206 - 1211 Melville Street
    Vancouver BC V6E 0A7
    604 682-4321 (H)
    hkim@gmail.com

    TENANT
    Park, Daniel
    ...
    FORM K: March 15, 2025

Section headers (case-insensitive, may include trailing colon or parenthesised qualifier):
    OWNER, CO-OWNER, TENANT, EMERGENCY CONTACT, KEY HOLDER, PROPERTY MANAGER

Lot separator: a line matching ^SL\s*\d+  or  ^STRATA\s+LOT\s+\d+
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
# Regex patterns
# ---------------------------------------------------------------------------

_LOT_HEADER = re.compile(
    r"^(?:strata\s+lot|sl)\s*[#:]?\s*(\d+)\s+(?:unit|unit\s*#?)\s*[#:]?\s*([A-Z0-9\-]+)",
    re.IGNORECASE,
)
_SECTION_OWNER = re.compile(
    r"^(owner|co[-\s]?owner|property\s+manager)\s*(?:\([^)]*\))?\s*:?\s*$", re.IGNORECASE
)
_SECTION_TENANT = re.compile(r"^tenant\s*:?\s*$", re.IGNORECASE)
_SECTION_EMERGENCY = re.compile(r"^emergency\s+contact\s*:?\s*$", re.IGNORECASE)
_SECTION_KEYHOLDER = re.compile(r"^key\s*holder\s*:?\s*$", re.IGNORECASE)

_EMAIL = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
_PHONE = re.compile(
    r"(\d{3})\s*[-.]?\s*(\d{3})\s*[-.]?\s*(\d{4})"
    r"(?:\s*(?:ext\.?\s*\d+)?)?"
    r"(?:\s*\(([HhCcWwBb])\))?"
)
_POSTAL_CA = re.compile(r"\b([A-Z]\d[A-Z]\s?\d[A-Z]\d)\b", re.IGNORECASE)
_FORM_K = re.compile(r"form\s+k(?:\s+filed)?[:\s]+(.+)$", re.IGNORECASE)
_CO = re.compile(r"^c/o\s+(.+)$", re.IGNORECASE)
_PROVINCE_LINE = re.compile(
    r"\b(BC|AB|SK|MB|ON|QC|NB|NS|PE|NL|NT|YT|NU"
    r"|British Columbia|Alberta|Ontario|Quebec)\b",
    re.IGNORECASE,
)

_PHONE_TYPE_MAP = {
    "h": "home_phone", "c": "cell_phone", "w": "work_phone",
    "b": "work_phone",  # business
}

_MONTH_ABBR = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ParsedContactMethod:
    method_type: str   # home_phone | cell_phone | work_phone | email
    value: str
    is_primary: bool = False


@dataclass
class ParsedParty:
    full_name: str
    role: str                   # LotAssignmentRole value string
    party_type: str = "individual"
    is_property_manager: bool = False
    parent_name: Optional[str] = None   # c/o entity name
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
# Public API
# ---------------------------------------------------------------------------

def parse_owner_list_pdf(pdf_bytes: bytes) -> list[ParsedLot]:
    """Parse an owner-list PDF and return structured lot records."""
    try:
        import pdfplumber
    except ImportError:
        raise RuntimeError("pdfplumber is required: pip install pdfplumber")

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        pages_text = []
        for page in pdf.pages:
            text = page.extract_text(x_tolerance=3, y_tolerance=3)
            if text:
                pages_text.append(text)
    full_text = "\n".join(pages_text)
    return parse_owner_list_text(full_text)


def parse_owner_list_text(text: str) -> list[ParsedLot]:
    """Parse extracted PDF text into structured lot records. Testable without a PDF file."""
    blocks = _split_into_lot_blocks(text)
    results: list[ParsedLot] = []
    for raw_block in blocks:
        try:
            lot = _parse_lot_block(raw_block)
            results.append(lot)
        except Exception as exc:
            log.warning("Failed to parse lot block: %s\nBlock: %.200s", exc, raw_block)
    return results


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _split_into_lot_blocks(text: str) -> list[str]:
    """Split full text into per-lot blocks using the SL header as a boundary."""
    lines = text.splitlines()
    blocks: list[str] = []
    current: list[str] = []

    for line in lines:
        if _LOT_HEADER.match(line.strip()):
            if current:
                blocks.append("\n".join(current))
            current = [line]
        else:
            current.append(line)

    if current:
        blocks.append("\n".join(current))

    return [b for b in blocks if b.strip()]


def _parse_lot_block(block: str) -> ParsedLot:
    """Parse a single lot text block into a ParsedLot."""
    lines = [ln.strip() for ln in block.splitlines()]
    warnings: list[str] = []

    # First line must be the lot header
    header_match = _LOT_HEADER.match(lines[0]) if lines else None
    if not header_match:
        raise ValueError(f"Block does not start with lot header: {lines[0]!r}")

    sl_number = int(header_match.group(1))
    unit_number = header_match.group(2).upper()

    lot = ParsedLot(
        strata_lot_number=sl_number,
        unit_number=unit_number,
        raw_text=block,
    )

    # Split remaining lines into section chunks
    section_lines: list[tuple[str, list[str]]] = []   # (role_key, lines)
    current_role: Optional[str] = None
    current_chunk: list[str] = []

    for line in lines[1:]:
        stripped = line.strip()
        if not stripped:
            continue

        role_key = _classify_section_header(stripped)
        if role_key is not None:
            if current_role is not None and current_chunk:
                section_lines.append((current_role, current_chunk))
            current_role = role_key
            current_chunk = []
        else:
            if current_role is not None:
                current_chunk.append(stripped)

    if current_role is not None and current_chunk:
        section_lines.append((current_role, current_chunk))

    if not section_lines:
        warnings.append(f"SL{sl_number}: no party sections found in block")

    for role_key, chunk in section_lines:
        parties, w = _parse_party_section(chunk, role_key, sl_number)
        lot.parties.extend(parties)
        warnings.extend(w)

    lot.parse_warnings = warnings
    return lot


def _classify_section_header(line: str) -> Optional[str]:
    """Return a role key if the line is a section header, else None."""
    upper = line.upper().rstrip(":").strip()

    if _SECTION_OWNER.match(line):
        if re.search(r"co[-\s]?owner", line, re.I):
            return "owner_absentee_co"  # treated as second owner
        if re.search(r"property\s+manager", line, re.I):
            return "property_manager_of_record"
        if re.search(r"occupant", line, re.I):
            return "owner_occupant"
        return "owner_absentee"   # default — occupant status refined later if address matches unit
    if _SECTION_TENANT.match(line):
        return "tenant"
    if _SECTION_EMERGENCY.match(line):
        return "emergency_contact"
    if _SECTION_KEYHOLDER.match(line):
        return "key_holder"
    return None


def _parse_party_section(
    lines: list[str], role_key: str, sl_number: int
) -> tuple[list[ParsedParty], list[str]]:
    """
    Parse lines belonging to one section (OWNER / TENANT / etc.) into 1-N ParsedParty objects.

    Returns (parties, warnings).

    Special cases handled:
    - Couples:  "Smith, John & Jane"  → single party
    - Co-owner: second line is "Lastname, First (Co-Owner)"  → second party
    - Corporate + c/o:  corp name then c/o line → parent_name set
    """
    warnings: list[str] = []
    if not lines:
        warnings.append(f"SL{sl_number}/{role_key}: empty section")
        return [], warnings

    # Determine the LotAssignmentRole value
    role_map = {
        "owner_occupant": "owner_occupant",
        "owner_absentee": "owner_absentee",
        "owner_absentee_co": "owner_absentee",
        "tenant": "tenant",
        "emergency_contact": "emergency_contact",
        "key_holder": "key_holder",
        "property_manager_of_record": "property_manager_of_record",
    }
    role = role_map.get(role_key, role_key)

    parties: list[ParsedParty] = []
    idx = 0

    # ---- Name line(s) -------------------------------------------------------
    name_line = lines[idx]
    idx += 1

    # Check if the line after name is a co-owner declaration
    co_owner_name: Optional[str] = None
    if idx < len(lines):
        next_line = lines[idx]
        if re.search(r"\(co[-\s]?owner\)", next_line, re.I):
            co_owner_name = re.sub(r"\s*\(co[-\s]?owner\)\s*", "", next_line, flags=re.I).strip()
            idx += 1

    # Detect corporate names (contains "Ltd.", "Inc.", "Corp.", "Holdings", "Properties", etc.)
    party_type = "individual"
    is_pm = False
    if re.search(r"\b(ltd\.?|inc\.?|corp\.?|limited|incorporated|holdings|properties"
                 r"|management|services|enterprises|group)\b", name_line, re.I):
        party_type = "corporation"

    # c/o line
    parent_name: Optional[str] = None
    if idx < len(lines) and _CO.match(lines[idx]):
        co_match = _CO.match(lines[idx])
        parent_name = co_match.group(1).strip()
        is_pm = bool(re.search(r"management|realty|property", parent_name, re.I))
        idx += 1

    # ---- Remaining lines: address, phones, email, Form K -------------------
    remaining = lines[idx:]
    contact_methods, address_parts, form_k, leftover = _extract_contact_info(remaining)

    city, province, postal, addr1, addr2 = _parse_address(address_parts)

    # Mark primary on first of each type
    _set_primary_flags(contact_methods)

    # Build first party
    p = ParsedParty(
        full_name=name_line,
        role=role,
        party_type=party_type,
        is_property_manager=is_pm,
        parent_name=parent_name,
        mailing_address_line1=addr1,
        mailing_address_line2=addr2,
        mailing_city=city,
        mailing_province=province,
        mailing_postal_code=postal,
        contact_methods=contact_methods,
        form_k_filed_date=form_k,
    )
    parties.append(p)

    # Build co-owner as a second party (same contact info, role = owner_absentee)
    if co_owner_name:
        co = ParsedParty(
            full_name=co_owner_name,
            role="owner_absentee",
            party_type="individual",
            mailing_address_line1=addr1,
            mailing_address_line2=addr2,
            mailing_city=city,
            mailing_province=province,
            mailing_postal_code=postal,
            contact_methods=[],   # don't duplicate contacts; link manually if needed
        )
        parties.append(co)

    if leftover:
        for ln in leftover:
            warnings.append(f"SL{sl_number}/{role_key}: unrecognized line: {ln!r}")

    return parties, warnings


def _extract_contact_info(
    lines: list[str],
) -> tuple[list[ParsedContactMethod], list[str], Optional[date], list[str]]:
    """
    Scan lines and pull out emails, phone numbers, Form K dates.
    Returns (contact_methods, address_lines, form_k_date, unrecognized_lines).
    """
    contact_methods: list[ParsedContactMethod] = []
    address_lines: list[str] = []
    form_k: Optional[date] = None
    leftover: list[str] = []

    for line in lines:
        # Form K
        fk_match = _FORM_K.search(line)
        if fk_match:
            form_k = _parse_date_fuzzy(fk_match.group(1).strip())
            continue

        # Email
        email_match = _EMAIL.search(line)
        if email_match:
            contact_methods.append(ParsedContactMethod("email", email_match.group(0).lower()))
            continue

        # Phone(s) — a line can have more than one phone
        phones_found = False
        for m in _PHONE.finditer(line):
            digits = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
            type_char = (m.group(4) or "c").lower()
            method_type = _PHONE_TYPE_MAP.get(type_char, "cell_phone")
            contact_methods.append(ParsedContactMethod(method_type, digits))
            phones_found = True
        if phones_found:
            continue

        # Address / province line → keep as address candidate
        if _looks_like_address(line):
            address_lines.append(line)
            continue

        # Unrecognized
        if line:
            leftover.append(line)

    return contact_methods, address_lines, form_k, leftover


def _looks_like_address(line: str) -> bool:
    """Heuristic: does this line look like part of a mailing address?"""
    if _PROVINCE_LINE.search(line):
        return True
    if _POSTAL_CA.search(line):
        return True
    # Starts with a number (street address)
    if re.match(r"^\d+", line):
        return True
    # Contains common address words
    if re.search(
        r"\b(street|st|avenue|ave|drive|dr|road|rd|way|blvd|boulevard"
        r"|lane|ln|place|pl|court|cr|crescent|suite|ste|floor|unit|apt|#)\b",
        line, re.I
    ):
        return True
    return False


def _parse_address(
    lines: list[str],
) -> tuple[Optional[str], Optional[str], Optional[str], Optional[str], Optional[str]]:
    """
    Given candidate address lines, return (city, province, postal, addr_line1, addr_line2).
    """
    if not lines:
        return None, None, None, None, None

    city: Optional[str] = None
    province: Optional[str] = None
    postal: Optional[str] = None
    addr1: Optional[str] = None
    addr2: Optional[str] = None

    # The line containing a Canadian province abbreviation is probably "City PROV POSTAL"
    city_line_idx: Optional[int] = None
    for i, line in enumerate(lines):
        prov_match = _PROVINCE_LINE.search(line)
        if prov_match:
            city_line_idx = i
            province = _normalise_province(prov_match.group(0))
            postal_match = _POSTAL_CA.search(line)
            if postal_match:
                postal = postal_match.group(1).upper().replace(" ", "")
            # City = everything before the province abbreviation
            city_raw = line[: prov_match.start()].strip().rstrip(",").strip()
            if city_raw:
                city = city_raw
            break

    # Lines before the city line are street address
    street_lines = [ln for i, ln in enumerate(lines) if i != city_line_idx]
    if street_lines:
        addr1 = street_lines[0]
    if len(street_lines) > 1:
        addr2 = ", ".join(street_lines[1:])

    return city, province, postal, addr1, addr2


def _normalise_province(raw: str) -> str:
    mapping = {
        "british columbia": "BC",
        "alberta": "AB",
        "ontario": "ON",
        "quebec": "QC",
        "saskatchewan": "SK",
        "manitoba": "MB",
    }
    return mapping.get(raw.lower(), raw.upper())


def _set_primary_flags(methods: list[ParsedContactMethod]) -> None:
    """Mark the first contact of each method_type as primary."""
    seen: set[str] = set()
    for cm in methods:
        if cm.method_type not in seen:
            cm.is_primary = True
            seen.add(cm.method_type)


def _parse_date_fuzzy(raw: str) -> Optional[date]:
    """
    Try to parse dates like:
      "March 15, 2025", "Mar 15, 2025", "2025-03-15", "15/03/2025"
    Returns a date object or None.
    """
    raw = raw.strip().rstrip(".")

    # ISO
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", raw)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass

    # DD/MM/YYYY or MM/DD/YYYY
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", raw)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            pass

    # "Month DD, YYYY" or "Mon DD YYYY"
    m = re.match(r"([A-Za-z]+)\s+(\d{1,2})[,\s]+(\d{4})", raw)
    if m:
        month_str = m.group(1).lower()[:3]
        month_num = _MONTH_ABBR.get(month_str)
        if month_num:
            try:
                return date(int(m.group(3)), month_num, int(m.group(2)))
            except ValueError:
                pass

    log.warning("Could not parse Form K date: %r", raw)
    return None
