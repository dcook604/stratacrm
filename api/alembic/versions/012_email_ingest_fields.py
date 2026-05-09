"""Add email ingest config table and email-sourced fields to issues."""

from alembic import op
import sqlalchemy as sa

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "email_ingest_config",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("ai_provider", sa.String(50), nullable=False, server_default="anthropic"),
        sa.Column("anthropic_api_key", sa.String(500), nullable=True),
        sa.Column("deepseek_api_key", sa.String(500), nullable=True),
        sa.Column("gmail_poll_label", sa.String(200), nullable=False, server_default="CRM-Inbound"),
        sa.Column("gmail_poll_interval_minutes", sa.Integer, nullable=False, server_default="10"),
        sa.Column("gmail_credentials_json", sa.Text, nullable=True),
        sa.Column("gmail_token_json", sa.Text, nullable=True),
        sa.Column("gmail_connected_email", sa.String(300), nullable=True),
        sa.Column("last_polled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_poll_stats", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    # Seed singleton config row
    op.execute("INSERT INTO email_ingest_config (id) VALUES (1)")

    op.add_column("issues", sa.Column("source", sa.String(50), nullable=False, server_default="manual"))
    op.add_column("issues", sa.Column("reporter_email", sa.String(300), nullable=True))
    op.add_column("issues", sa.Column("reporter_name", sa.String(200), nullable=True))
    op.add_column("issues", sa.Column("gmail_message_id", sa.String(200), nullable=True))
    op.create_unique_constraint("uq_issues_gmail_message_id", "issues", ["gmail_message_id"])


def downgrade():
    op.drop_constraint("uq_issues_gmail_message_id", "issues", type_="unique")
    op.drop_column("issues", "gmail_message_id")
    op.drop_column("issues", "reporter_name")
    op.drop_column("issues", "reporter_email")
    op.drop_column("issues", "source")
    op.drop_table("email_ingest_config")
