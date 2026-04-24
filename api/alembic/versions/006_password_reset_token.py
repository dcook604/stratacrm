"""Add password_reset_token and password_reset_token_expires_at to users.

Revision ID: 006
Revises: 005
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("password_reset_token", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("password_reset_token_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_users_password_reset_token"), "users", ["password_reset_token"], unique=True)


def downgrade():
    op.drop_index(op.f("ix_users_password_reset_token"), table_name="users")
    op.drop_column("users", "password_reset_token_expires_at")
    op.drop_column("users", "password_reset_token")
