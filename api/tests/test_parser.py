"""
Parser unit tests using realistic text fixtures for the four BCS2611 cases
described in the PRD:
  - 0110: multi-tenant lot (absentee owner + 2 tenants)
  - 0606: owner-occupant couple (David & Sarah)
  - 0138: corporate owner with c/o property manager
  - 3608: owner with co-owner (Alan + Joshua)
"""

import pytest
from datetime import date
from app.pdf_import.parser import parse_owner_list_text, ParsedLot, ParsedParty


# ---------------------------------------------------------------------------
# Text fixtures — simulate what pdfplumber extracts from the actual PDF
# ---------------------------------------------------------------------------

FIXTURE_0110 = """
SL 10    UNIT 0110
OWNER (ABSENTEE)
Kim, Hyosook
#2206 - 1211 Melville Street
Vancouver BC V6E 0A7
604 682-4321 (H)
hkim@gmail.com

TENANT
Park, Daniel Sungwoo
0110 - 602 Citadel Parade
Vancouver BC V6B 1X3
778 228-5678 (C)
dpark@hotmail.com
FORM K: March 15, 2025

TENANT
Lee, Jennifer Ann
0110 - 602 Citadel Parade
Vancouver BC V6B 1X3
604 312-9999 (C)
jlee@outlook.com
FORM K: March 15, 2025
"""

FIXTURE_0606 = """
SL 36    UNIT 0606
OWNER (OCCUPANT)
Wilson, David & Sarah
0606 - 602 Citadel Parade
Vancouver BC V6B 1X3
604 683-1234 (H) 604 720-5678 (C)
dwilson@telus.net
"""

FIXTURE_0138 = """
SL 38    UNIT 0138
OWNER (ABSENTEE)
Maple Properties Corp.
c/o Stratacorp Management Services Inc.
1166 Alberni Street Suite 700
Vancouver BC V6E 3Z3
604 688-5000 (W)
admin@maplecorp.ca
"""

FIXTURE_3608 = """
SL 185    UNIT 3608
OWNER (OCCUPANT)
Da Rocha Brum, Alan
Levesque, Joshua David (Co-Owner)
3608 - 602 Citadel Parade
Vancouver BC V6B 1X3
604 500-1234 (C)
alan.drb@gmail.com
"""

COMBINED = FIXTURE_0110 + FIXTURE_0606 + FIXTURE_0138 + FIXTURE_3608


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _lot_by_sl(lots: list[ParsedLot], sl: int) -> ParsedLot:
    for lot in lots:
        if lot.strata_lot_number == sl:
            return lot
    raise AssertionError(f"SL{sl} not found in parsed output")


def _party_by_role(lot: ParsedLot, role: str) -> list[ParsedParty]:
    return [p for p in lot.parties if p.role == role]


def _email_values(party: ParsedParty) -> list[str]:
    return [cm.value for cm in party.contact_methods if cm.method_type == "email"]


def _phone_values(party: ParsedParty, phone_type: str) -> list[str]:
    return [cm.value for cm in party.contact_methods if cm.method_type == phone_type]


# ---------------------------------------------------------------------------
# Tests — Fixture 0110 (multi-tenant)
# ---------------------------------------------------------------------------

class TestFixture0110:
    def setup_method(self):
        lots = parse_owner_list_text(FIXTURE_0110)
        assert lots, "Expected at least one lot parsed"
        self.lot = lots[0]

    def test_lot_header(self):
        assert self.lot.strata_lot_number == 10
        assert self.lot.unit_number == "0110"

    def test_has_one_owner(self):
        owners = _party_by_role(self.lot, "owner_absentee")
        assert len(owners) == 1
        assert owners[0].full_name == "Kim, Hyosook"

    def test_owner_contact(self):
        owner = _party_by_role(self.lot, "owner_absentee")[0]
        assert "hkim@gmail.com" in _email_values(owner)
        assert "604-682-4321" in _phone_values(owner, "home_phone")

    def test_owner_address(self):
        owner = _party_by_role(self.lot, "owner_absentee")[0]
        assert owner.mailing_city == "Vancouver"
        assert owner.mailing_province == "BC"
        assert owner.mailing_postal_code == "V6E0A7"

    def test_has_two_tenants(self):
        tenants = _party_by_role(self.lot, "tenant")
        assert len(tenants) == 2
        names = {t.full_name for t in tenants}
        assert "Park, Daniel Sungwoo" in names
        assert "Lee, Jennifer Ann" in names

    def test_tenant_form_k(self):
        tenants = _party_by_role(self.lot, "tenant")
        for t in tenants:
            assert t.form_k_filed_date == date(2025, 3, 15)

    def test_no_critical_warnings(self):
        # Parse warnings are allowed but should not include "no party sections found"
        for w in self.lot.parse_warnings:
            assert "no party sections" not in w


# ---------------------------------------------------------------------------
# Tests — Fixture 0606 (owner-occupant couple)
# ---------------------------------------------------------------------------

class TestFixture0606:
    def setup_method(self):
        lots = parse_owner_list_text(FIXTURE_0606)
        self.lot = lots[0]

    def test_lot_header(self):
        assert self.lot.strata_lot_number == 36
        assert self.lot.unit_number == "0606"

    def test_couple_as_single_party(self):
        owners = _party_by_role(self.lot, "owner_occupant")
        assert len(owners) == 1
        assert owners[0].full_name == "Wilson, David & Sarah"

    def test_couple_contact(self):
        owner = _party_by_role(self.lot, "owner_occupant")[0]
        assert "dwilson@telus.net" in _email_values(owner)
        phones = [cm.value for cm in owner.contact_methods
                  if cm.method_type in ("home_phone", "cell_phone")]
        assert len(phones) == 2

    def test_no_tenants(self):
        assert _party_by_role(self.lot, "tenant") == []


# ---------------------------------------------------------------------------
# Tests — Fixture 0138 (corporate owner + c/o property manager)
# ---------------------------------------------------------------------------

class TestFixture0138:
    def setup_method(self):
        lots = parse_owner_list_text(FIXTURE_0138)
        self.lot = lots[0]

    def test_lot_header(self):
        assert self.lot.strata_lot_number == 38
        assert self.lot.unit_number == "0138"

    def test_corporate_party_type(self):
        owners = _party_by_role(self.lot, "owner_absentee")
        assert len(owners) == 1
        assert owners[0].party_type == "corporation"
        assert owners[0].full_name == "Maple Properties Corp."

    def test_co_parent_captured(self):
        owner = _party_by_role(self.lot, "owner_absentee")[0]
        assert owner.parent_name is not None
        assert "Stratacorp" in owner.parent_name

    def test_corporate_contact(self):
        owner = _party_by_role(self.lot, "owner_absentee")[0]
        assert "admin@maplecorp.ca" in _email_values(owner)
        assert "604-688-5000" in _phone_values(owner, "work_phone")


# ---------------------------------------------------------------------------
# Tests — Fixture 3608 (owner with co-owner)
# ---------------------------------------------------------------------------

class TestFixture3608:
    def setup_method(self):
        lots = parse_owner_list_text(FIXTURE_3608)
        self.lot = lots[0]

    def test_lot_header(self):
        assert self.lot.strata_lot_number == 185
        assert self.lot.unit_number == "3608"

    def test_two_owner_parties(self):
        owners = [p for p in self.lot.parties
                  if p.role in ("owner_occupant", "owner_absentee")]
        assert len(owners) == 2

    def test_primary_owner_name(self):
        primary = next(p for p in self.lot.parties if p.role == "owner_occupant")
        assert primary.full_name == "Da Rocha Brum, Alan"

    def test_co_owner_name(self):
        co = next(p for p in self.lot.parties if p.role == "owner_absentee")
        assert "Levesque" in co.full_name

    def test_primary_has_contacts(self):
        primary = next(p for p in self.lot.parties if p.role == "owner_occupant")
        assert "alan.drb@gmail.com" in _email_values(primary)


# ---------------------------------------------------------------------------
# Tests — Combined parsing (all 4 fixtures together)
# ---------------------------------------------------------------------------

class TestCombined:
    def setup_method(self):
        self.lots = parse_owner_list_text(COMBINED)

    def test_four_lots_parsed(self):
        assert len(self.lots) == 4

    def test_all_sl_numbers_present(self):
        sl_numbers = {lot.strata_lot_number for lot in self.lots}
        assert sl_numbers == {10, 36, 38, 185}

    def test_total_party_count(self):
        # SL10: 1 owner + 2 tenants = 3
        # SL36: 1 owner = 1
        # SL38: 1 owner = 1
        # SL185: 2 owners = 2
        total = sum(len(lot.parties) for lot in self.lots)
        assert total == 7
