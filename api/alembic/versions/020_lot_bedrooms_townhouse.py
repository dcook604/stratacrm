"""Add bedrooms and is_townhouse columns to lots.

Revision ID: 020
Revises: 019
Create Date: 2026-05-11
"""
from alembic import op
import sqlalchemy as sa

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("lots", sa.Column("bedrooms", sa.Integer(), nullable=True))
    op.add_column("lots", sa.Column("is_townhouse", sa.Boolean(), nullable=True))


def downgrade():
    op.drop_column("lots", "is_townhouse")
    op.drop_column("lots", "bedrooms")
