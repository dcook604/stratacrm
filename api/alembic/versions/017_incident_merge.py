"""Add incident merge support: merged_into_id and merged_at columns."""

from alembic import op
import sqlalchemy as sa

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("incidents", sa.Column("merged_into_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_incidents_merged_into", "incidents", "incidents",
        ["merged_into_id"], ["id"], ondelete="SET NULL",
    )
    op.add_column("incidents", sa.Column("merged_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_constraint("fk_incidents_merged_into", "incidents", type_="foreignkey")
    op.drop_column("incidents", "merged_at")
    op.drop_column("incidents", "merged_into_id")
