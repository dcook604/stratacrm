"""Add bike_lockers and scooter_lockers columns to lots.

Revision ID: 005
Revises: 004
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("lots", sa.Column("bike_lockers", sa.Text(), nullable=True))
    op.add_column("lots", sa.Column("scooter_lockers", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("lots", "scooter_lockers")
    op.drop_column("lots", "bike_lockers")
