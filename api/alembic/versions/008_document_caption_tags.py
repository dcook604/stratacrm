"""Add caption and tags fields to documents table.

Revision ID: 008
Revises: 007
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("documents", sa.Column("caption", sa.Text(), nullable=True))
    op.add_column("documents", sa.Column("tags", sa.String(500), nullable=True))


def downgrade():
    op.drop_column("documents", "caption")
    op.drop_column("documents", "tags")
