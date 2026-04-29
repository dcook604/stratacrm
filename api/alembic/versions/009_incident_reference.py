"""Add reference column to incidents table.

Revision ID: 009
Revises: 008
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade():
    # Add nullable first so existing rows don't violate NOT NULL immediately.
    op.add_column("incidents", sa.Column("reference", sa.String(12), nullable=True))
    op.create_index("ix_incidents_reference", "incidents", ["reference"], unique=True)

    # Back-fill any pre-existing rows with generated references.
    from app.utils.reference import generate_reference
    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id FROM incidents ORDER BY id")).fetchall()
    for (incident_id,) in rows:
        # Retry on the astronomically unlikely collision.
        for _ in range(10):
            ref = generate_reference("TKT")
            result = connection.execute(
                sa.text("SELECT 1 FROM incidents WHERE reference = :ref"),
                {"ref": ref},
            ).first()
            if result is None:
                connection.execute(
                    sa.text("UPDATE incidents SET reference = :ref WHERE id = :id"),
                    {"ref": ref, "id": incident_id},
                )
                break

    # Now enforce NOT NULL.
    op.alter_column("incidents", "reference", nullable=False)


def downgrade():
    op.drop_index("ix_incidents_reference", table_name="incidents")
    op.drop_column("incidents", "reference")
