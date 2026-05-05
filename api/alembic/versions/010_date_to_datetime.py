"""Change Date columns to DateTime(timezone=True) for time capture support.

Infractions, incidents, and issues now optionally support time alongside date.

Revision ID: 010
Revises: 009
Create Date: 2026-05-05
"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "infractions", "complaint_received_date",
        type_=sa.DateTime(timezone=True),
        existing_type=sa.Date(),
        postgresql_using="complaint_received_date::timestamp::timestamptz",
    )
    op.alter_column(
        "incidents", "incident_date",
        type_=sa.DateTime(timezone=True),
        existing_type=sa.Date(),
        postgresql_using="incident_date::timestamp::timestamptz",
    )
    op.alter_column(
        "issues", "due_date",
        type_=sa.DateTime(timezone=True),
        existing_type=sa.Date(),
        postgresql_using="due_date::timestamp::timestamptz",
    )


def downgrade():
    op.alter_column(
        "infractions", "complaint_received_date",
        type_=sa.Date(),
        existing_type=sa.DateTime(timezone=True),
        postgresql_using="complaint_received_date::date",
    )
    op.alter_column(
        "incidents", "incident_date",
        type_=sa.Date(),
        existing_type=sa.DateTime(timezone=True),
        postgresql_using="incident_date::date",
    )
    op.alter_column(
        "issues", "due_date",
        type_=sa.Date(),
        existing_type=sa.DateTime(timezone=True),
        postgresql_using="due_date::date",
    )
