"""Add incident_notes and issue_notes tables; add note type to infraction events."""

from alembic import op
import sqlalchemy as sa

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "incident_notes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("incident_id", sa.Integer,
                  sa.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("source", sa.String(50), nullable=False, server_default="manual"),
        sa.Column("author_email", sa.String(200), nullable=True),
        sa.Column("author_name", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_incident_notes_incident_id", "incident_notes", ["incident_id"])

    op.create_table(
        "issue_notes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("issue_id", sa.Integer,
                  sa.ForeignKey("issues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("source", sa.String(50), nullable=False, server_default="manual"),
        sa.Column("author_email", sa.String(200), nullable=True),
        sa.Column("author_name", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_issue_notes_issue_id", "issue_notes", ["issue_id"])

    op.execute("ALTER TYPE infractioneventtype ADD VALUE IF NOT EXISTS 'note'")


def downgrade():
    op.drop_index("ix_issue_notes_issue_id", "issue_notes")
    op.drop_table("issue_notes")
    op.drop_index("ix_incident_notes_incident_id", "incident_notes")
    op.drop_table("incident_notes")
    # PostgreSQL does not support removing enum values
