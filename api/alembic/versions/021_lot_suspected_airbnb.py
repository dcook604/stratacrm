"""Add suspected_airbnb column to lots.

Revision ID: 021
Revises: 020
Create Date: 2026-05-11
"""
from alembic import op
import sqlalchemy as sa

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("lots", sa.Column("suspected_airbnb", sa.Boolean(), nullable=True, server_default="false"))


def downgrade():
    op.drop_column("lots", "suspected_airbnb")
