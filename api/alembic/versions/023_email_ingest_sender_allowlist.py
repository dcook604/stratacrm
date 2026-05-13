"""Add allowed_senders to email_ingest_config

Revision ID: 023
Revises: 022
Create Date: 2026-05-13
"""
from alembic import op
import sqlalchemy as sa

revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "email_ingest_config",
        sa.Column("allowed_senders", sa.Text(), nullable=True),
    )


def downgrade():
    op.drop_column("email_ingest_config", "allowed_senders")
