"""Add email_subject to incidents for subject-based dedup matching.

Revision ID: 019
Revises: 018
Create Date: 2026-05-11
"""
from alembic import op
import sqlalchemy as sa

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("incidents", sa.Column("email_subject", sa.String(500), nullable=True))


def downgrade():
    op.drop_column("incidents", "email_subject")
