"""
Parser unit tests for the flat-table PDF format used by the BCS2611 owner list.

The PDF is a wide relational table split across 4 column groups:
  Group 1: sl_number | unit | contact_type
  Group 2: name
  Group 3: address | phone_home | phone_cell
  Group 4: phone_work | email

Tests drive _build_lots() directly with pre-merged row dicts, and also exercise
the column group detection logic via synthetic pdfplumber table data.
"""

import pytest
from app.pdf_import.parser import (
    parse_owner_list_pdf,
    ParsedLot, ParsedParty,
    _build_lots, _detect_group, _parse_address_string, _map_contact_type,
)


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


def _emails(party: ParsedParty) -> list[str]:
    return [cm.value for cm in party.contact_methods if cm.method_type == "email"]


def _phones(party: ParsedParty, phone_type: str) -> list[str]:
    return [cm.value for cm in party.contact_methods if cm.method_type == phone_type]


# ---------------------------------------------------------------------------
# Row fixtures — pre-merged dicts (as produced after joining the 4 groups)
# ---------------------------------------------------------------------------

ROW_OWNER_ABSENTEE = {
    "sl_number": "10", "unit": "0110", "contact_type": "Owner Absentee",
    "name": "Kim, Hyosook",
    "address": "#2206 - 1211 Melville Street\nVancouver BC V6E 0A7",
    "phone_home": "604-682-4321", "phone_cell": "", "phone_work": "",
    "email": "hkim@gmail.com",
}

ROW_TENANT_1 = {
    "sl_number": "10", "unit": "0110", "contact_type": "Tenant",
    "name": "Park, Daniel Sungwoo",
    "address": "0110 - 602 Citadel Parade\nVancouver BC V6B 1X3",
    "phone_home": "", "phone_cell": "778-228-5678", "phone_work": "",
    "email": "dpark@hotmail.com",
}

ROW_TENANT_2 = {
    "sl_number": "10", "unit": "0110", "contact_type": "Tenant",
    "name": "Lee, Jennifer Ann",
    "address": "0110 - 602 Citadel Parade\nVancouver BC V6B 1X3",
    "phone_home": "", "phone_cell": "604-312-9999", "phone_work": "",
    "email": "jlee@outlook.com",
}

ROW_OWNER_OCCUPANT = {
    "sl_number": "36", "unit": "0606", "contact_type": "Owner Occupant",
    "name": "Wilson, David & Sarah",
    "address": "0606 - 602 Citadel Parade\nVancouver BC V6B 1X3",
    "phone_home": "604-683-1234", "phone_cell": "604-720-5678", "phone_work": "",
    "email": "dwilson@telus.net",
}

ROW_CORPORATE = {
    "sl_number": "38", "unit": "0138", "contact_type": "Owner Absentee",
    "name": "Maple Properties Corp.",
    "address": "1166 Alberni Street Suite 700\nVancouver BC V6E 3Z3",
    "phone_home": "", "phone_cell": "", "phone_work": "604-688-5000",
    "email": "admin@maplecorp.ca",
}

ROW_OWNER_COOWNER_PRIMARY = {
    "sl_number": "185", "unit": "3608", "contact_type": "Owner Occupant",
    "name": "Da Rocha Brum, Alan",
    "address": "3608 - 602 Citadel Parade\nVancouver BC V6B 1X3",
    "phone_home": "", "phone_cell": "604-500-1234", "phone_work": "",
    "email": "alan.drb@gmail.com",
}

ROW_OWNER_COOWNER_SECONDARY = {
    "sl_number": "185", "unit": "3608", "contact_type": "Owner Absentee",
    "name": "Levesque, Joshua David",
    "address": "3608 - 602 Citadel Parade\nVancouver BC V6B 1X3",
    "phone_home": "", "phone_cell": "", "phone_work": "",
    "email": "",
}

ALL_ROWS = [
    ROW_OWNER_ABSENTEE, ROW_TENANT_1, ROW_TENANT_2,
    ROW_OWNER_OCCUPANT, ROW_CORPORATE,
    ROW_OWNER_COOWNER_PRIMARY, ROW_OWNER_COOWNER_SECONDARY,
]


# ---------------------------------------------------------------------------
# _build_lots tests
# ---------------------------------------------------------------------------

class TestBuildLotsMultiTenant:
    def setup_method(self):
        lots = _build_lots([ROW_OWNER_ABSENTEE, ROW_TENANT_1, ROW_TENANT_2])
        assert lots
        self.lot = lots[0]

    def test_lot_identity(self):
        assert self.lot.strata_lot_number == 10
        assert self.lot.unit_number == "0110"

    def test_owner_parsed(self):
        owners = _party_by_role(self.lot, "owner_absentee")
        assert len(owners) == 1
        assert owners[0].full_name == "Kim, Hyosook"

    def test_owner_home_phone(self):
        owner = _party_by_role(self.lot, "owner_absentee")[0]
        assert "604-682-4321" in _phones(owner, "home_phone")

    def test_owner_email(self):
        owner = _party_by_role(self.lot, "owner_absentee")[0]
        assert "hkim@gmail.com" in _emails(owner)

    def test_owner_address(self):
        owner = _party_by_role(self.lot, "owner_absentee")[0]
        assert owner.mailing_city == "Vancouver"
        assert owner.mailing_province == "BC"
        assert owner.mailing_postal_code == "V6E0A7"

    def test_two_tenants(self):
        tenants = _party_by_role(self.lot, "tenant")
        assert len(tenants) == 2
        names = {t.full_name for t in tenants}
        assert "Park, Daniel Sungwoo" in names
        assert "Lee, Jennifer Ann" in names


class TestBuildLotsOwnerOccupant:
    def setup_method(self):
        lots = _build_lots([ROW_OWNER_OCCUPANT])
        self.lot = lots[0]

    def test_lot_identity(self):
        assert self.lot.strata_lot_number == 36
        assert self.lot.unit_number == "0606"

    def test_owner_occupant_role(self):
        owners = _party_by_role(self.lot, "owner_occupant")
        assert len(owners) == 1
        assert owners[0].full_name == "Wilson, David & Sarah"

    def test_two_phones(self):
        owner = _party_by_role(self.lot, "owner_occupant")[0]
        home = _phones(owner, "home_phone")
        cell = _phones(owner, "cell_phone")
        assert len(home) == 1
        assert len(cell) == 1

    def test_no_tenants(self):
        assert _party_by_role(self.lot, "tenant") == []


class TestBuildLotsCorporate:
    def setup_method(self):
        lots = _build_lots([ROW_CORPORATE])
        self.lot = lots[0]

    def test_party_type_corporation(self):
        owners = _party_by_role(self.lot, "owner_absentee")
        assert owners[0].party_type == "corporation"

    def test_work_phone(self):
        owner = _party_by_role(self.lot, "owner_absentee")[0]
        assert "604-688-5000" in _phones(owner, "work_phone")

    def test_email(self):
        owner = _party_by_role(self.lot, "owner_absentee")[0]
        assert "admin@maplecorp.ca" in _emails(owner)


class TestBuildLotsCoOwner:
    def setup_method(self):
        lots = _build_lots([ROW_OWNER_COOWNER_PRIMARY, ROW_OWNER_COOWNER_SECONDARY])
        self.lot = lots[0]

    def test_lot_identity(self):
        assert self.lot.strata_lot_number == 185
        assert self.lot.unit_number == "3608"

    def test_two_parties(self):
        assert len(self.lot.parties) == 2

    def test_primary_owner(self):
        primary = next(p for p in self.lot.parties if p.role == "owner_occupant")
        assert primary.full_name == "Da Rocha Brum, Alan"
        assert "alan.drb@gmail.com" in _emails(primary)

    def test_co_owner(self):
        co = next(p for p in self.lot.parties if p.role == "owner_absentee")
        assert "Levesque" in co.full_name


class TestBuildLotsCombined:
    def setup_method(self):
        self.lots = _build_lots(ALL_ROWS)

    def test_four_lots(self):
        assert len(self.lots) == 4

    def test_sl_numbers(self):
        sl_numbers = {lot.strata_lot_number for lot in self.lots}
        assert sl_numbers == {10, 36, 38, 185}

    def test_total_party_count(self):
        # SL10: 1 owner + 2 tenants; SL36: 1 owner; SL38: 1 owner; SL185: 2 owners
        total = sum(len(lot.parties) for lot in self.lots)
        assert total == 7


# ---------------------------------------------------------------------------
# Column group detection tests
# ---------------------------------------------------------------------------

class TestDetectGroup:
    def test_group1_sl_number(self):
        grp, col_map = _detect_group("sl_number unit contact_type", ["sl_number", "unit", "contact_type"])
        assert grp == 1
        assert 0 in col_map and col_map[0] == "sl_number"

    def test_group1_strata_lot(self):
        grp, _ = _detect_group("Strata Lot Unit Contact Type", ["Strata Lot", "Unit", "Contact Type"])
        assert grp == 1

    def test_group2_name(self):
        grp, col_map = _detect_group("name", ["name"])
        assert grp == 2

    def test_group3_address(self):
        grp, col_map = _detect_group("address phone_home phone_cell", ["address", "phone_home", "phone_cell"])
        assert grp == 3

    def test_group4_phone_work(self):
        grp, col_map = _detect_group("phone_work email", ["phone_work", "email"])
        assert grp == 4

    def test_unknown_header(self):
        grp, _ = _detect_group("foo bar baz", ["foo", "bar", "baz"])
        assert grp is None


# ---------------------------------------------------------------------------
# Address parsing tests
# ---------------------------------------------------------------------------

class TestParseAddressString:
    def test_bc_address(self):
        city, prov, postal, addr1, addr2 = _parse_address_string(
            "#2206 - 1211 Melville Street\nVancouver BC V6E 0A7"
        )
        assert city == "Vancouver"
        assert prov == "BC"
        assert postal == "V6E0A7"
        assert addr1 == "#2206 - 1211 Melville Street"

    def test_empty(self):
        city, prov, postal, addr1, addr2 = _parse_address_string("")
        assert all(v is None for v in (city, prov, postal, addr1, addr2))

    def test_no_province(self):
        city, prov, postal, addr1, addr2 = _parse_address_string("123 Main Street")
        assert prov is None
        assert addr1 == "123 Main Street"


# ---------------------------------------------------------------------------
# Contact type mapping tests
# ---------------------------------------------------------------------------

class TestMapContactType:
    def test_owner_absentee(self):
        assert _map_contact_type("Owner Absentee", 1) == "owner_absentee"

    def test_owner_occupant(self):
        assert _map_contact_type("Owner Occupant", 1) == "owner_occupant"

    def test_tenant(self):
        assert _map_contact_type("Tenant", 1) == "tenant"

    def test_emergency_contact(self):
        assert _map_contact_type("Emergency Contact", 1) == "emergency_contact"

    def test_emergency_contact_key_holder(self):
        assert _map_contact_type("Emergency Contact/Key Holder", 1) == "emergency_contact"

    def test_key_holder(self):
        assert _map_contact_type("Key Holder", 1) == "key_holder"

    def test_case_insensitive(self):
        assert _map_contact_type("owner absentee", 1) == "owner_absentee"
        assert _map_contact_type("TENANT", 1) == "tenant"
