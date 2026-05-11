"""Add full-text search columns and GIN indexes for cross-entity search.

Adds a `search_vector` tsvector column to parties, lots, bylaws, infractions,
incidents, and issues, with auto-maintenance triggers and GIN indexes.
Existing rows are backfilled in the same migration.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None

# Tables that get a search_vector column
_TABLES = {
    "parties": {
        "weights": {
            "A": ["full_name"],
            "B": ["notes"],
        }
    },
    "lots": {
        "weights": {
            "A": ["unit_number"],
            "B": ["notes"],
            "C": ["parking_stalls", "storage_lockers", "bike_lockers", "scooter_lockers"],
        }
    },
    "bylaws": {
        "weights": {
            "A": ["full_text"],
            "B": ["title", "bylaw_number"],
        }
    },
    "infractions": {
        "weights": {
            "A": ["description"],
            "B": ["complaint_source"],
        }
    },
    "incidents": {
        "weights": {
            "A": ["description"],
            "B": ["category", "reference", "common_area_description"],
            "C": ["reported_by"],
        }
    },
    "issues": {
        "weights": {
            "A": ["title"],
            "B": ["description"],
        }
    },
}


def _weight_expr(weight: str, columns: list[str]) -> str:
    """Build a setweight(to_tsvector(...)) expression for a weight group."""
    parts = []
    for col in columns:
        parts.append(f"coalesce(NEW.{col}, '')")
    concatenated = " || ' ' || ".join(parts)
    return f"setweight(to_tsvector('english', {concatenated}), '{weight}')"


def upgrade():
    # 1. Add search_vector column + GIN index to each table
    for table in _TABLES:
        op.add_column(table, sa.Column("search_vector", postgresql.TSVECTOR(), nullable=True))
        op.create_index(
            f"ix_{table}_search_vector",
            table,
            ["search_vector"],
            postgresql_using="gin",
        )

    # 2. Create the shared trigger function
    cases = []
    for table, cfg in _TABLES.items():
        when = f"TG_TABLE_NAME = '{table}'"
        weight_exprs = " || ".join(
            f"\n                    {_weight_expr(w, cols)}"
            for w, cols in cfg["weights"].items()
        )
        then = f"NEW.search_vector := {weight_exprs};"
        cases.append(f"            {when} THEN\n{then}")

    trigger_body = "\n".join(cases)

    op.execute(f"""
        CREATE OR REPLACE FUNCTION tsvector_update_searchable()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
{trigger_body}
            RETURN NEW;
        END;
        $$;
    """)

    # 3. Create triggers on each table
    for table in _TABLES:
        op.execute(f"""
            CREATE TRIGGER trg_{table}_search_vector
            BEFORE INSERT OR UPDATE ON {table}
            FOR EACH ROW EXECUTE FUNCTION tsvector_update_searchable();
        """)

    # 4. Backfill existing rows — the trigger computes the vector on UPDATE
    for table in _TABLES:
        op.execute(f"UPDATE {table} SET search_vector = NULL;")


def downgrade():
    for table in _TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_search_vector ON {table};")
        op.drop_index(f"ix_{table}_search_vector", table, postgresql_using="gin")
        op.drop_column(table, "search_vector")

    op.execute("DROP FUNCTION IF EXISTS tsvector_update_searchable;")
