"""Seed sample bylaws and fine schedules for BCS2611.

Revision ID: 003
Revises: 002
Create Date: 2026-04-14
"""
from datetime import date

from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None

# ---------------------------------------------------------------------------
# Seed data — representative bylaws for a Vancouver high-rise strata.
# Fine caps per Strata Property Act Regulation:
#   - General: $200 per contravention
#   - Rental violations: $50 per contravention
# ---------------------------------------------------------------------------

BYLAWS = [
    {
        "bylaw_number": "3.1",
        "section": "3.1",
        "title": "Noise — Quiet Hours",
        "full_text": (
            "An owner, tenant, occupant, or visitor must not cause or allow noise "
            "in a strata lot or on the common property that unreasonably interferes "
            "with the rights of other owners, tenants or occupants to use and enjoy "
            "the common property or another strata lot. Quiet hours are 10:00 PM to "
            "8:00 AM Monday through Friday and 11:00 PM to 9:00 AM on weekends and "
            "statutory holidays."
        ),
        "category": "noise",
        "active_from": "2020-01-01",
        "fine_schedules": [
            {"occurrence_number": 1, "fine_amount": "100.00", "continuing_contravention_amount": None, "max_per_week": None},
            {"occurrence_number": 2, "fine_amount": "150.00", "continuing_contravention_amount": None, "max_per_week": None},
            {"occurrence_number": 99, "fine_amount": "200.00", "continuing_contravention_amount": "50.00", "max_per_week": "200.00"},
        ],
    },
    {
        "bylaw_number": "4.1",
        "section": "4.1",
        "title": "Pets — Approval and Conduct",
        "full_text": (
            "An owner, tenant or occupant must not keep a pet in a strata lot without "
            "prior written approval of the Strata Council. Approval may be given for a "
            "maximum of two (2) pets per strata lot. Pets must be kept on a leash in "
            "all common property areas. Owners are responsible for the conduct of their "
            "pets and must immediately clean up any waste deposited by their pet on "
            "common property."
        ),
        "category": "pets",
        "active_from": "2020-01-01",
        "fine_schedules": [
            {"occurrence_number": 1, "fine_amount": "100.00", "continuing_contravention_amount": None, "max_per_week": None},
            {"occurrence_number": 2, "fine_amount": "200.00", "continuing_contravention_amount": "50.00", "max_per_week": "200.00"},
            {"occurrence_number": 99, "fine_amount": "200.00", "continuing_contravention_amount": "50.00", "max_per_week": "200.00"},
        ],
    },
    {
        "bylaw_number": "5.1",
        "section": "5.1",
        "title": "Parking — Designated Stalls Only",
        "full_text": (
            "An owner, tenant, occupant or visitor must not park a vehicle in any "
            "parking stall other than the stall(s) assigned to the strata lot, without "
            "the prior written approval of the Strata Council. Vehicles parked in "
            "violation of this bylaw may be towed at the vehicle owner's expense. "
            "Vehicles must not be left idling in the parkade for more than 3 minutes."
        ),
        "category": "parking",
        "active_from": "2020-01-01",
        "fine_schedules": [
            {"occurrence_number": 1, "fine_amount": "75.00", "continuing_contravention_amount": None, "max_per_week": None},
            {"occurrence_number": 2, "fine_amount": "150.00", "continuing_contravention_amount": None, "max_per_week": None},
            {"occurrence_number": 99, "fine_amount": "200.00", "continuing_contravention_amount": "75.00", "max_per_week": "200.00"},
        ],
    },
    {
        "bylaw_number": "6.1",
        "section": "6.1",
        "title": "Smoking — Prohibition",
        "full_text": (
            "Smoking, including the use of electronic cigarettes and vaping devices, "
            "is strictly prohibited in all areas of the building, including all strata "
            "lots, limited common property, common property, and within 6 metres of any "
            "building entrance or operable window. This bylaw applies to all tobacco "
            "products and cannabis under the Cannabis Act."
        ),
        "category": "smoking",
        "active_from": "2020-01-01",
        "fine_schedules": [
            {"occurrence_number": 1, "fine_amount": "200.00", "continuing_contravention_amount": None, "max_per_week": None},
            {"occurrence_number": 2, "fine_amount": "200.00", "continuing_contravention_amount": "100.00", "max_per_week": "200.00"},
            {"occurrence_number": 99, "fine_amount": "200.00", "continuing_contravention_amount": "100.00", "max_per_week": "200.00"},
        ],
    },
    {
        "bylaw_number": "7.1",
        "section": "7.1",
        "title": "Move-In / Move-Out — Booking Required",
        "full_text": (
            "An owner or tenant must book the service elevator and loading bay a "
            "minimum of 48 hours in advance with the Strata Manager for any move-in "
            "or move-out. All moves must be completed between 8:00 AM and 5:00 PM on "
            "weekdays only (no weekends or statutory holidays). A refundable damage "
            "deposit of $500 is required before the move date and will be returned "
            "within 14 days provided no damage to common property has occurred."
        ),
        "category": "move_in_out",
        "active_from": "2020-01-01",
        "fine_schedules": [
            {"occurrence_number": 1, "fine_amount": "200.00", "continuing_contravention_amount": None, "max_per_week": None},
            {"occurrence_number": 2, "fine_amount": "200.00", "continuing_contravention_amount": None, "max_per_week": None},
            {"occurrence_number": 99, "fine_amount": "200.00", "continuing_contravention_amount": None, "max_per_week": None},
        ],
    },
    {
        "bylaw_number": "8.1",
        "section": "8.1",
        "title": "Alterations — Approval Required",
        "full_text": (
            "An owner must obtain prior written approval from the Strata Council before "
            "making any alteration to a strata lot that involves the structure of the "
            "building, plumbing, electrical systems, common property, limited common "
            "property, or any portion of the strata lot visible from the exterior. "
            "The owner must provide plans, specifications, and proof of all required "
            "permits before work commences. All work must be performed by licensed "
            "contractors and must conform to the BC Building Code."
        ),
        "category": "alterations",
        "active_from": "2020-01-01",
        "fine_schedules": [
            {"occurrence_number": 1, "fine_amount": "200.00", "continuing_contravention_amount": "100.00", "max_per_week": "200.00"},
            {"occurrence_number": 2, "fine_amount": "200.00", "continuing_contravention_amount": "100.00", "max_per_week": "200.00"},
            {"occurrence_number": 99, "fine_amount": "200.00", "continuing_contravention_amount": "100.00", "max_per_week": "200.00"},
        ],
    },
    {
        "bylaw_number": "9.1",
        "section": "9.1",
        "title": "Nuisance — Waste and Common Property",
        "full_text": (
            "An owner, tenant, occupant or visitor must not cause a nuisance or hazard "
            "to another owner, tenant, occupant or visitor, or use common property in a "
            "way that unreasonably interferes with the rights of others. This includes, "
            "but is not limited to: leaving personal property in common hallways or "
            "stairwells, failing to properly dispose of waste in designated receptacles, "
            "and creating odours that permeate through common walls or corridors."
        ),
        "category": "nuisance",
        "active_from": "2020-01-01",
        "fine_schedules": [
            {"occurrence_number": 1, "fine_amount": "100.00", "continuing_contravention_amount": None, "max_per_week": None},
            {"occurrence_number": 2, "fine_amount": "150.00", "continuing_contravention_amount": None, "max_per_week": None},
            {"occurrence_number": 99, "fine_amount": "200.00", "continuing_contravention_amount": "50.00", "max_per_week": "200.00"},
        ],
    },
    {
        "bylaw_number": "10.1",
        "section": "10.1",
        "title": "Rental — Form K Requirement",
        "full_text": (
            "An owner who rents their strata lot must ensure that the tenant files a "
            "Form K (Tenant's Notice to Strata Corporation) with the Strata Corporation "
            "within 14 days of the tenancy commencing, as required by section 146 of "
            "the Strata Property Act. The owner must provide the tenant with a copy of "
            "the current bylaws and rules of the Strata Corporation prior to or at the "
            "commencement of the tenancy."
        ),
        "category": "rental",
        "active_from": "2020-01-01",
        "fine_schedules": [
            # Rental fines capped at $50 per SPA Regulation
            {"occurrence_number": 1, "fine_amount": "50.00", "continuing_contravention_amount": None, "max_per_week": None},
            {"occurrence_number": 2, "fine_amount": "50.00", "continuing_contravention_amount": None, "max_per_week": None},
            {"occurrence_number": 99, "fine_amount": "50.00", "continuing_contravention_amount": "10.00", "max_per_week": "50.00"},
        ],
    },
]


def upgrade() -> None:
    conn = op.get_bind()

    # Idempotent: skip if bylaws already exist
    count = conn.execute(sa.text("SELECT COUNT(*) FROM bylaws")).scalar()
    if count and count > 0:
        return

    for b in BYLAWS:
        result = conn.execute(
            sa.text(
                """
                INSERT INTO bylaws
                    (bylaw_number, section, title, full_text, category, active_from, created_at)
                VALUES
                    (:bylaw_number, :section, :title, :full_text, :category, :active_from, now())
                RETURNING id
                """
            ),
            {
                "bylaw_number": b["bylaw_number"],
                "section": b["section"],
                "title": b["title"],
                "full_text": b["full_text"],
                "category": b["category"],
                "active_from": b["active_from"],
            },
        )
        bylaw_id = result.scalar()

        for fs in b["fine_schedules"]:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO fine_schedules
                        (bylaw_id, occurrence_number, fine_amount,
                         continuing_contravention_amount, max_per_week)
                    VALUES
                        (:bylaw_id, :occurrence_number, :fine_amount,
                         :continuing_contravention_amount, :max_per_week)
                    """
                ),
                {
                    "bylaw_id": bylaw_id,
                    "occurrence_number": fs["occurrence_number"],
                    "fine_amount": fs["fine_amount"],
                    "continuing_contravention_amount": fs["continuing_contravention_amount"],
                    "max_per_week": fs["max_per_week"],
                },
            )


def downgrade() -> None:
    op.execute("DELETE FROM fine_schedules WHERE bylaw_id IN (SELECT id FROM bylaws WHERE bylaw_number IN ('3.1','4.1','5.1','6.1','7.1','8.1','9.1','10.1'))")
    op.execute("DELETE FROM bylaws WHERE bylaw_number IN ('3.1','4.1','5.1','6.1','7.1','8.1','9.1','10.1')")
