"""Add failed_login_attempts, locked_until, last_activity_at to users.

Revision ID: 007
Revises: 006
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("users", "last_activity_at")
    op.drop_column("users", "locked_until")
    op.drop_column("users", "failed_login_attempts")
