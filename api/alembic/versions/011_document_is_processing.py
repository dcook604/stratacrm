"""Add is_processing flag to documents for background video transcoding.

Revision ID: 011
Revises: 010
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "documents",
        sa.Column("is_processing", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade():
    op.drop_column("documents", "is_processing")
