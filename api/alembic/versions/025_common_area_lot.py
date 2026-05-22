"""Add a synthetic Common Area lot (strata_lot_number=0) for unassigned incidents.

Revision ID: 025
Revises: 024
Create Date: 2026-05-22
"""
from alembic import op

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        INSERT INTO lots (strata_corporation_id, strata_lot_number, unit_number, notes)
        VALUES (1, 0, 'Common Area', 'Synthetic lot for incidents not tied to a specific unit.')
        ON CONFLICT (strata_corporation_id, strata_lot_number) DO NOTHING;
    """)


def downgrade():
    op.execute("""
        DELETE FROM lots
        WHERE strata_corporation_id = 1 AND strata_lot_number = 0;
    """)
