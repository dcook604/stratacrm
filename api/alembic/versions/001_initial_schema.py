"""Initial schema — all entities for Spectrum 4 Strata CRM

Revision ID: 001
Revises:
Create Date: 2026-04-14
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Enum types
    # ------------------------------------------------------------------
    op.execute("CREATE TYPE userrole AS ENUM ('admin','council_member','property_manager','auditor')")
    op.execute("CREATE TYPE partytype AS ENUM ('individual','corporation')")
    op.execute("CREATE TYPE contactmethodtype AS ENUM ('home_phone','cell_phone','work_phone','email')")
    op.execute(
        "CREATE TYPE lotassignmentrole AS ENUM "
        "('owner_occupant','owner_absentee','tenant','emergency_contact','key_holder','agent','property_manager_of_record')"
    )
    op.execute(
        "CREATE TYPE bylawcategory AS ENUM "
        "('noise','pets','parking','common_property','rental','alterations','move_in_out','smoking','nuisance','other')"
    )
    op.execute(
        "CREATE TYPE infractionstatus AS ENUM "
        "('open','notice_sent','response_received','hearing_scheduled','fined','dismissed','appealed')"
    )
    op.execute(
        "CREATE TYPE infractioneventtype AS ENUM "
        "('complaint_received','notice_sent','response_received','hearing_held','decision_made','fine_levied','payment_received','dismissed')"
    )
    op.execute("CREATE TYPE deliverymethod AS ENUM ('email','registered_mail','posted')")
    op.execute("CREATE TYPE incidentstatus AS ENUM ('open','in_progress','resolved','closed')")
    op.execute("CREATE TYPE issuestatus AS ENUM ('open','in_progress','resolved','closed')")
    op.execute("CREATE TYPE issuepriority AS ENUM ('low','medium','high','urgent')")
    op.execute("CREATE TYPE communicationchannel AS ENUM ('listmonk','transactional','manual')")

    # ------------------------------------------------------------------
    # users  (no foreign key deps)
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE users (
            id                      SERIAL PRIMARY KEY,
            email                   VARCHAR(300) UNIQUE NOT NULL,
            password_hash           VARCHAR(200) NOT NULL,
            full_name               VARCHAR(200) NOT NULL,
            role                    userrole NOT NULL DEFAULT 'council_member',
            is_active               BOOLEAN NOT NULL DEFAULT TRUE,
            last_login_at           TIMESTAMPTZ,
            password_reset_required BOOLEAN NOT NULL DEFAULT TRUE,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_users_email ON users (email)")

    # ------------------------------------------------------------------
    # audit_log
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE audit_log (
            id          SERIAL PRIMARY KEY,
            actor_id    INTEGER REFERENCES users (id) ON DELETE SET NULL,
            actor_email VARCHAR(300),
            action      VARCHAR(50) NOT NULL,
            entity_type VARCHAR(100) NOT NULL,
            entity_id   INTEGER,
            changes     JSONB,
            occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ip_address  VARCHAR(50)
        )
    """)
    op.execute("CREATE INDEX ix_audit_log_occurred_at ON audit_log (occurred_at)")
    op.execute("CREATE INDEX ix_audit_log_entity ON audit_log (entity_type, entity_id)")

    # ------------------------------------------------------------------
    # strata_corporations
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE strata_corporations (
            id          SERIAL PRIMARY KEY,
            strata_plan VARCHAR(50) UNIQUE NOT NULL,
            name        VARCHAR(200) NOT NULL,
            address     TEXT,
            city        VARCHAR(100),
            province    VARCHAR(50) DEFAULT 'BC',
            postal_code VARCHAR(10),
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # ------------------------------------------------------------------
    # parties
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE parties (
            id                   SERIAL PRIMARY KEY,
            party_type           partytype NOT NULL DEFAULT 'individual',
            full_name            VARCHAR(300) NOT NULL,
            is_property_manager  BOOLEAN NOT NULL DEFAULT FALSE,
            parent_party_id      INTEGER REFERENCES parties (id) ON DELETE SET NULL,
            mailing_address_line1 VARCHAR(200),
            mailing_address_line2 VARCHAR(200),
            mailing_city         VARCHAR(100),
            mailing_province     VARCHAR(50),
            mailing_postal_code  VARCHAR(10),
            mailing_country      VARCHAR(100) DEFAULT 'Canada',
            notes                TEXT,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_parties_full_name ON parties (full_name)")

    # ------------------------------------------------------------------
    # lots
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE lots (
            id                      SERIAL PRIMARY KEY,
            strata_corporation_id   INTEGER NOT NULL REFERENCES strata_corporations (id),
            strata_lot_number       INTEGER NOT NULL,
            unit_number             VARCHAR(20),
            square_feet             NUMERIC(8,2),
            parking_stalls          TEXT,
            storage_lockers         TEXT,
            notes                   TEXT,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_lot_strata_number UNIQUE (strata_corporation_id, strata_lot_number)
        )
    """)

    # ------------------------------------------------------------------
    # documents  (referenced by infraction_events and notices)
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE documents (
            id                  SERIAL PRIMARY KEY,
            storage_path        VARCHAR(500) NOT NULL,
            original_filename   VARCHAR(300),
            mime_type           VARCHAR(100),
            file_size_bytes     INTEGER,
            uploaded_by_id      INTEGER REFERENCES users (id) ON DELETE SET NULL,
            linked_entity_type  VARCHAR(100),
            linked_entity_id    INTEGER,
            uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_documents_entity ON documents (linked_entity_type, linked_entity_id)")

    # ------------------------------------------------------------------
    # contact_methods
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE contact_methods (
            id          SERIAL PRIMARY KEY,
            party_id    INTEGER NOT NULL REFERENCES parties (id) ON DELETE CASCADE,
            method_type contactmethodtype NOT NULL,
            value       VARCHAR(200) NOT NULL,
            is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
            verified_at TIMESTAMPTZ,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_contact_methods_party_id ON contact_methods (party_id)")

    # ------------------------------------------------------------------
    # lot_assignments
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE lot_assignments (
            id                  SERIAL PRIMARY KEY,
            lot_id              INTEGER NOT NULL REFERENCES lots (id) ON DELETE CASCADE,
            party_id            INTEGER NOT NULL REFERENCES parties (id) ON DELETE CASCADE,
            role                lotassignmentrole NOT NULL,
            start_date          DATE,
            end_date            DATE,
            form_k_filed_date   DATE,
            is_current          BOOLEAN NOT NULL DEFAULT TRUE,
            notes               TEXT,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_lot_assignments_lot_current ON lot_assignments (lot_id, is_current)")

    # ------------------------------------------------------------------
    # bylaws
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE bylaws (
            id             SERIAL PRIMARY KEY,
            bylaw_number   VARCHAR(50) NOT NULL,
            section        VARCHAR(50),
            title          VARCHAR(300) NOT NULL,
            full_text      TEXT NOT NULL,
            category       bylawcategory NOT NULL,
            active_from    DATE NOT NULL,
            superseded_by  INTEGER REFERENCES bylaws (id) ON DELETE SET NULL,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # ------------------------------------------------------------------
    # fine_schedules
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE fine_schedules (
            id                              SERIAL PRIMARY KEY,
            bylaw_id                        INTEGER NOT NULL REFERENCES bylaws (id) ON DELETE CASCADE,
            occurrence_number               INTEGER NOT NULL,
            fine_amount                     NUMERIC(10,2) NOT NULL,
            continuing_contravention_amount NUMERIC(10,2),
            max_per_week                    NUMERIC(10,2),
            CONSTRAINT uq_fine_schedule_bylaw_occurrence UNIQUE (bylaw_id, occurrence_number)
        )
    """)

    # ------------------------------------------------------------------
    # infractions
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE infractions (
            id                      SERIAL PRIMARY KEY,
            lot_id                  INTEGER NOT NULL REFERENCES lots (id),
            primary_party_id        INTEGER NOT NULL REFERENCES parties (id),
            bylaw_id                INTEGER NOT NULL REFERENCES bylaws (id),
            complaint_received_date DATE NOT NULL,
            complaint_source        TEXT,
            description             TEXT NOT NULL,
            status                  infractionstatus NOT NULL DEFAULT 'open',
            assessed_fine_amount    NUMERIC(10,2),
            occurrence_number       INTEGER NOT NULL DEFAULT 1,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_infractions_status ON infractions (status)")
    op.execute("CREATE INDEX ix_infractions_lot_id ON infractions (lot_id)")

    # ------------------------------------------------------------------
    # infraction_events  (append-only s.135 trail)
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE infraction_events (
            id             SERIAL PRIMARY KEY,
            infraction_id  INTEGER NOT NULL REFERENCES infractions (id) ON DELETE CASCADE,
            event_type     infractioneventtype NOT NULL,
            occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            actor_id       INTEGER REFERENCES users (id) ON DELETE SET NULL,
            actor_email    VARCHAR(200),
            notes          TEXT,
            document_id    INTEGER REFERENCES documents (id) ON DELETE SET NULL
        )
    """)
    op.execute("CREATE INDEX ix_infraction_events_infraction_id ON infraction_events (infraction_id)")

    # ------------------------------------------------------------------
    # notices
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE notices (
            id              SERIAL PRIMARY KEY,
            infraction_id   INTEGER NOT NULL REFERENCES infractions (id) ON DELETE CASCADE,
            document_id     INTEGER REFERENCES documents (id) ON DELETE SET NULL,
            delivery_method deliverymethod NOT NULL,
            delivered_at    TIMESTAMPTZ,
            read_receipt    TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # ------------------------------------------------------------------
    # incidents
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE incidents (
            id                      SERIAL PRIMARY KEY,
            incident_date           DATE NOT NULL,
            lot_id                  INTEGER REFERENCES lots (id) ON DELETE SET NULL,
            common_area_description VARCHAR(300),
            category                VARCHAR(100) NOT NULL,
            description             TEXT NOT NULL,
            reported_by             VARCHAR(200),
            status                  incidentstatus NOT NULL DEFAULT 'open',
            resolution              TEXT,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # ------------------------------------------------------------------
    # issues
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE issues (
            id                  SERIAL PRIMARY KEY,
            title               VARCHAR(300) NOT NULL,
            description         TEXT,
            assignee_id         INTEGER REFERENCES users (id) ON DELETE SET NULL,
            due_date            DATE,
            priority            issuepriority NOT NULL DEFAULT 'medium',
            status              issuestatus NOT NULL DEFAULT 'open',
            related_lot_id      INTEGER REFERENCES lots (id) ON DELETE SET NULL,
            related_incident_id INTEGER REFERENCES incidents (id) ON DELETE SET NULL,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # ------------------------------------------------------------------
    # communications_log
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE communications_log (
            id                  SERIAL PRIMARY KEY,
            channel             communicationchannel NOT NULL,
            template_id         VARCHAR(200),
            recipient_party_id  INTEGER REFERENCES parties (id) ON DELETE SET NULL,
            sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            status              VARCHAR(50),
            message_id          VARCHAR(200),
            subject             VARCHAR(500),
            body_preview        TEXT
        )
    """)

    # ------------------------------------------------------------------
    # updated_at trigger (applied to all tables that have it)
    # ------------------------------------------------------------------
    op.execute("""
        CREATE OR REPLACE FUNCTION _set_updated_at()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            NEW.updated_at := NOW();
            RETURN NEW;
        END;
        $$
    """)

    for table in [
        "users", "parties", "lots", "lot_assignments",
        "infractions", "incidents", "issues",
    ]:
        op.execute(f"""  # nosemgrep: python.lang.security.audit.formatted-sql-query.formatted-sql-query, python.sqlalchemy.security.sqlalchemy-execute-raw-query.sqlalchemy-execute-raw-query
            CREATE TRIGGER trg_{table}_updated_at
            BEFORE UPDATE ON {table}
            FOR EACH ROW EXECUTE FUNCTION _set_updated_at()
        """)


def downgrade() -> None:
    # Drop triggers
    for table in [
        "users", "parties", "lots", "lot_assignments",
        "infractions", "incidents", "issues",
    ]:
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table}")  # nosemgrep: python.lang.security.audit.formatted-sql-query.formatted-sql-query, python.sqlalchemy.security.sqlalchemy-execute-raw-query.sqlalchemy-execute-raw-query

    op.execute("DROP FUNCTION IF EXISTS _set_updated_at()")

    # Drop tables in reverse dependency order
    for table in [
        "communications_log",
        "issues",
        "incidents",
        "notices",
        "infraction_events",
        "infractions",
        "fine_schedules",
        "bylaws",
        "lot_assignments",
        "contact_methods",
        "documents",
        "lots",
        "parties",
        "strata_corporations",
        "audit_log",
        "users",
    ]:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")  # nosemgrep: python.lang.security.audit.formatted-sql-query.formatted-sql-query, python.sqlalchemy.security.sqlalchemy-execute-raw-query.sqlalchemy-execute-raw-query

    # Drop enum types
    for enum_type in [
        "communicationchannel", "issuepriority", "issuestatus",
        "incidentstatus", "deliverymethod", "infractioneventtype",
        "infractionstatus", "bylawcategory", "lotassignmentrole",
        "contactmethodtype", "partytype", "userrole",
    ]:
        op.execute(f"DROP TYPE IF EXISTS {enum_type}")  # nosemgrep: python.lang.security.audit.formatted-sql-query.formatted-sql-query, python.sqlalchemy.security.sqlalchemy-execute-raw-query.sqlalchemy-execute-raw-query
