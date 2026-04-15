"""Add import staging tables for PDF owner-list import pipeline

Revision ID: 002
Revises: 001
Create Date: 2026-04-14
"""

from typing import Sequence, Union
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enum types
    op.execute("CREATE TYPE importbatchstatus AS ENUM ('pending','reviewing','completed','cancelled')")
    op.execute("CREATE TYPE stagedlotstatus AS ENUM ('pending','confirmed','skipped')")
    op.execute("CREATE TYPE stagedpartyaction AS ENUM ('create','merge','skip')")
    op.execute("CREATE TYPE duplicateconfidence AS ENUM ('none','low','medium','high')")

    # import_batches
    op.execute("""
        CREATE TABLE import_batches (
            id                SERIAL PRIMARY KEY,
            original_filename VARCHAR(300) NOT NULL,
            uploaded_by_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
            uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            status            importbatchstatus NOT NULL DEFAULT 'reviewing',
            total_lots        INTEGER NOT NULL DEFAULT 0,
            lots_confirmed    INTEGER NOT NULL DEFAULT 0,
            lots_skipped      INTEGER NOT NULL DEFAULT 0,
            completed_at      TIMESTAMPTZ,
            notes             TEXT
        )
    """)

    # import_staged_lots
    op.execute("""
        CREATE TABLE import_staged_lots (
            id                  SERIAL PRIMARY KEY,
            batch_id            INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
            lot_id              INTEGER REFERENCES lots(id) ON DELETE SET NULL,
            strata_lot_number   INTEGER NOT NULL,
            unit_number         VARCHAR(20),
            status              stagedlotstatus NOT NULL DEFAULT 'pending',
            confirmed_by_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
            confirmed_at        TIMESTAMPTZ,
            parse_warnings      JSONB NOT NULL DEFAULT '[]',
            raw_text            TEXT
        )
    """)
    op.execute(
        "CREATE INDEX ix_import_staged_lots_batch_sl "
        "ON import_staged_lots (batch_id, strata_lot_number)"
    )

    # import_staged_parties
    op.execute("""
        CREATE TABLE import_staged_parties (
            id                          SERIAL PRIMARY KEY,
            staged_lot_id               INTEGER NOT NULL
                                            REFERENCES import_staged_lots(id) ON DELETE CASCADE,
            role                        VARCHAR(50) NOT NULL,
            full_name                   VARCHAR(300) NOT NULL,
            party_type                  VARCHAR(20) NOT NULL DEFAULT 'individual',
            is_property_manager         BOOLEAN NOT NULL DEFAULT FALSE,
            parent_name                 VARCHAR(300),
            mailing_address_line1       VARCHAR(200),
            mailing_address_line2       VARCHAR(200),
            mailing_city                VARCHAR(100),
            mailing_province            VARCHAR(50),
            mailing_postal_code         VARCHAR(10),
            contact_methods             JSONB NOT NULL DEFAULT '[]',
            form_k_filed_date           DATE,
            notes                       TEXT,
            detected_duplicate_party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
            duplicate_confidence        duplicateconfidence NOT NULL DEFAULT 'none',
            action                      stagedpartyaction,
            merge_target_party_id       INTEGER REFERENCES parties(id) ON DELETE SET NULL
        )
    """)
    op.execute(
        "CREATE INDEX ix_import_staged_parties_lot "
        "ON import_staged_parties (staged_lot_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS import_staged_parties CASCADE")
    op.execute("DROP TABLE IF EXISTS import_staged_lots CASCADE")
    op.execute("DROP TABLE IF EXISTS import_batches CASCADE")
    for t in ["duplicateconfidence", "stagedpartyaction", "stagedlotstatus", "importbatchstatus"]:
        op.execute(f"DROP TYPE IF EXISTS {t}")
