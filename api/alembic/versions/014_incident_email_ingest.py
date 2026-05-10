"""Move email ingest from issues to incidents; add pending_assignment to incidentstatus."""

from alembic import op
import sqlalchemy as sa

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade():
    # Add pending_assignment to incidentstatus enum
    op.execute("ALTER TYPE incidentstatus ADD VALUE IF NOT EXISTS 'pending_assignment'")

    # Add email ingest fields to incidents
    op.add_column("incidents", sa.Column("source", sa.String(50), nullable=False, server_default="manual"))
    op.add_column("incidents", sa.Column("reporter_email", sa.String(300), nullable=True))
    op.add_column("incidents", sa.Column("email_message_id", sa.String(200), nullable=True))
    op.add_column("incidents", sa.Column("raw_unit_hint", sa.String(200), nullable=True))
    op.create_unique_constraint("uq_incidents_email_message_id", "incidents", ["email_message_id"])

    # Remove email ingest fields from issues (added in migration 013 by mistake)
    op.drop_constraint("uq_issues_email_message_id", "issues", type_="unique")
    op.drop_column("issues", "email_message_id")
    op.drop_column("issues", "raw_unit_hint")
    op.drop_column("issues", "reporter_email")
    op.drop_column("issues", "reporter_name")
    op.drop_column("issues", "source")


def downgrade():
    op.add_column("issues", sa.Column("source", sa.String(50), nullable=False, server_default="manual"))
    op.add_column("issues", sa.Column("reporter_name", sa.String(200), nullable=True))
    op.add_column("issues", sa.Column("reporter_email", sa.String(300), nullable=True))
    op.add_column("issues", sa.Column("raw_unit_hint", sa.String(200), nullable=True))
    op.add_column("issues", sa.Column("email_message_id", sa.String(200), nullable=True))
    op.create_unique_constraint("uq_issues_email_message_id", "issues", ["email_message_id"])

    op.drop_constraint("uq_incidents_email_message_id", "incidents", type_="unique")
    op.drop_column("incidents", "raw_unit_hint")
    op.drop_column("incidents", "email_message_id")
    op.drop_column("incidents", "reporter_email")
    op.drop_column("incidents", "source")
    # Note: PostgreSQL does not support removing enum values
