"""Add file_hash column to documents table for duplicate detection."""

from alembic import op
import sqlalchemy as sa

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("documents", sa.Column("file_hash", sa.String(64), nullable=True))
    op.create_index("ix_documents_file_hash", "documents", ["file_hash"])


def downgrade():
    op.drop_index("ix_documents_file_hash", table_name="documents")
    op.drop_column("documents", "file_hash")
