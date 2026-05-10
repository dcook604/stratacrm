"""Switch email ingest from Gmail OAuth to IMAP; add pending_assignment status."""

from alembic import op
import sqlalchemy as sa

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade():
    # Add pending_assignment to IssueStatus enum (PostgreSQL requires this outside a tx on <12)
    op.execute("ALTER TYPE issuestatus ADD VALUE IF NOT EXISTS 'pending_assignment'")

    # issues: raw_unit_hint + rename dedup key column
    op.add_column("issues", sa.Column("raw_unit_hint", sa.String(200), nullable=True))
    op.alter_column("issues", "gmail_message_id", new_column_name="email_message_id")
    op.drop_constraint("uq_issues_gmail_message_id", "issues", type_="unique")
    op.create_unique_constraint("uq_issues_email_message_id", "issues", ["email_message_id"])

    # email_ingest_config: rename poll interval + add IMAP columns
    op.alter_column(
        "email_ingest_config", "gmail_poll_interval_minutes",
        new_column_name="poll_interval_minutes",
    )
    op.add_column("email_ingest_config", sa.Column("imap_host", sa.String(500), nullable=True))
    op.add_column("email_ingest_config", sa.Column("imap_port", sa.Integer, nullable=True))
    op.add_column("email_ingest_config", sa.Column("imap_username", sa.String(300), nullable=True))
    op.add_column("email_ingest_config", sa.Column("imap_password", sa.String(500), nullable=True))
    op.add_column(
        "email_ingest_config",
        sa.Column("imap_use_ssl", sa.Boolean, nullable=False, server_default="true"),
    )
    op.add_column(
        "email_ingest_config",
        sa.Column("imap_mailbox", sa.String(200), nullable=False, server_default="INBOX"),
    )


def downgrade():
    op.drop_column("email_ingest_config", "imap_mailbox")
    op.drop_column("email_ingest_config", "imap_use_ssl")
    op.drop_column("email_ingest_config", "imap_password")
    op.drop_column("email_ingest_config", "imap_username")
    op.drop_column("email_ingest_config", "imap_port")
    op.drop_column("email_ingest_config", "imap_host")
    op.alter_column(
        "email_ingest_config", "poll_interval_minutes",
        new_column_name="gmail_poll_interval_minutes",
    )
    op.drop_constraint("uq_issues_email_message_id", "issues", type_="unique")
    op.create_unique_constraint("uq_issues_gmail_message_id", "issues", ["email_message_id"])
    op.alter_column("issues", "email_message_id", new_column_name="gmail_message_id")
    op.drop_column("issues", "raw_unit_hint")
    # Note: PostgreSQL does not support removing enum values
