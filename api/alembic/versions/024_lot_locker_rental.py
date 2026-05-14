"""Add locker rental fields to lots.

Revision ID: 024
Revises: 023
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("lots", sa.Column("renting_locker", sa.Boolean(), nullable=True, server_default="false"))
    op.add_column("lots", sa.Column("locker_number", sa.Text(), nullable=True))
    op.add_column("lots", sa.Column("locker_signup_date", sa.Date(), nullable=True))


def downgrade():
    op.drop_column("lots", "locker_signup_date")
    op.drop_column("lots", "locker_number")
    op.drop_column("lots", "renting_locker")
