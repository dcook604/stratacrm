"""
Spectrum 4 Strata CRM — FastAPI application entry point.

Startup sequence:
  1. Alembic migration runs (via Docker CMD before uvicorn).
  2. On first start, seeds: BCS2611 strata corporation, 245 empty lots, admin user.
"""

import logging
import secrets
import string
from contextlib import asynccontextmanager

import bcrypt
import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.database import SessionLocal
from app.models import Lot, StrataCorporation, User, UserRole
from app.routers import auth as auth_router
from app.routers import lots as lots_router
from app.routers import parties as parties_router
from app.routers import imports as imports_router
from app.routers import bylaws as bylaws_router
from app.routers import infractions as infractions_router
from app.routers import incidents as incidents_router
from app.routers import issues as issues_router
from app.routers import documents as documents_router
from app.routers import sync as sync_router
from app.routers.auth import limiter

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        logging.DEBUG if settings.debug else logging.INFO
    ),
)
log = structlog.get_logger()


def _generate_password(length: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _seed_database() -> None:
    db = SessionLocal()
    try:
        # Idempotent: only runs when strata_corporations is empty.
        from sqlalchemy import select, func as sqlfunc2
        existing = db.execute(select(sqlfunc2.count()).select_from(StrataCorporation)).scalar()
        if existing and existing > 0:
            return

        log.info("Seeding database for first run")

        # 1. Strata corporation
        corp = StrataCorporation(
            strata_plan="BCS2611",
            name="The Owners, Strata Plan BCS2611 (Spectrum 4)",
            address="602 Citadel Parade",
            city="Vancouver",
            province="BC",
            postal_code="V6B 1X3",
        )
        db.add(corp)
        db.flush()

        # 2. 245 empty lots (SL1–SL245)
        for sl in range(1, 246):
            db.add(Lot(strata_corporation_id=corp.id, strata_lot_number=sl))

        # 3. Admin user
        temp_password = _generate_password()
        admin = User(
            email="admin@spectrum4.ca",
            password_hash=bcrypt.hashpw(temp_password.encode(), bcrypt.gensalt(rounds=12)).decode(),
            full_name="System Administrator",
            role=UserRole.admin,
            is_active=True,
            password_reset_required=True,
        )
        db.add(admin)
        db.commit()

        # Print to stdout so the operator can retrieve it from docker logs
        log.info(
            "=== FIRST-RUN CREDENTIALS ===",
            email="admin@spectrum4.ca",
            temporary_password=temp_password,
            note="Password reset required on first login.",
        )

    except IntegrityError:
        db.rollback()
        log.info("Seed skipped — another worker already seeded the database")
    except Exception:
        db.rollback()
        log.exception("Seed failed — rolling back")
        raise
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _seed_database()
    yield


app = FastAPI(
    title="Spectrum 4 Strata CRM",
    version="1.0.0",
    docs_url="/api/docs" if settings.debug else None,
    redoc_url="/api/redoc" if settings.debug else None,
    openapi_url="/api/openapi.json" if settings.debug else None,
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Middleware (order matters: outer → inner on request, inner → outer on response)
# ---------------------------------------------------------------------------

# CORS — allow frontend dev server; in production both are on same domain
if settings.debug:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*", "X-CSRF-Token"],
    )

app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie="s4_session",
    max_age=30 * 24 * 3600,        # 30 days
    same_site=settings.same_site,  # "lax" dev / "strict" prod
    https_only=settings.https_only,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

API_PREFIX = "/api"

app.include_router(auth_router.router, prefix=API_PREFIX)
app.include_router(lots_router.router, prefix=API_PREFIX)
app.include_router(parties_router.router, prefix=API_PREFIX)
app.include_router(imports_router.router, prefix=API_PREFIX)
app.include_router(bylaws_router.router, prefix=API_PREFIX)
app.include_router(infractions_router.router, prefix=API_PREFIX)
app.include_router(incidents_router.router, prefix=API_PREFIX)
app.include_router(issues_router.router, prefix=API_PREFIX)
app.include_router(documents_router.router, prefix=API_PREFIX)
app.include_router(sync_router.router, prefix=API_PREFIX)


# ---------------------------------------------------------------------------
# Dashboard stats endpoint
# ---------------------------------------------------------------------------

from fastapi import Depends
from sqlalchemy.orm import Session
from sqlalchemy import select, func as sqlfunc
from app.database import get_db
from app.dependencies import get_current_user
from app.models import AuditLog, Incident, IncidentStatus, Infraction, InfractionStatus, Issue, IssueStatus, Party
from datetime import date, datetime, timedelta, timezone


@app.get(f"{API_PREFIX}/dashboard/stats")
def dashboard_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    lot_count = db.execute(select(sqlfunc.count()).select_from(Lot)).scalar() or 0
    party_count = db.execute(select(sqlfunc.count()).select_from(Party)).scalar() or 0

    open_infractions = db.execute(
        select(sqlfunc.count()).select_from(Infraction)
        .where(Infraction.status.in_([InfractionStatus.open, InfractionStatus.notice_sent,
                                       InfractionStatus.response_received, InfractionStatus.hearing_scheduled]))
    ).scalar() or 0

    open_incidents = db.execute(
        select(sqlfunc.count()).select_from(Incident)
        .where(Incident.status.in_([IncidentStatus.open, IncidentStatus.in_progress]))
    ).scalar() or 0

    open_issues = db.execute(
        select(sqlfunc.count()).select_from(Issue)
        .where(Issue.status.in_([IssueStatus.open, IssueStatus.in_progress]))
    ).scalar() or 0

    # "Needs Attention" items
    # 1. Infractions in notice_sent older than 14 days (response window expired)
    from app.models import InfractionEvent, InfractionEventType
    from sqlalchemy.orm import selectinload as sio
    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=14)
    overdue_notice_infs = db.execute(
        select(Infraction)
        .join(InfractionEvent, InfractionEvent.infraction_id == Infraction.id)
        .where(Infraction.status == InfractionStatus.notice_sent)
        .where(InfractionEvent.event_type == InfractionEventType.notice_sent)
        .where(InfractionEvent.occurred_at < cutoff_dt)
        .options(sio(Infraction.lot), sio(Infraction.primary_party))
        .distinct()
        .limit(10)
    ).scalars().all()

    # 2. Overdue issues
    overdue_issues = db.execute(
        select(Issue)
        .where(Issue.due_date < date.today())
        .where(Issue.status.in_([IssueStatus.open, IssueStatus.in_progress]))
        .options(sio(Issue.assignee))
        .order_by(Issue.due_date.asc())
        .limit(10)
    ).scalars().all()

    recent_audit = db.execute(
        select(AuditLog)
        .order_by(AuditLog.occurred_at.desc())
        .limit(20)
    ).scalars().all()

    return {
        "lot_count": lot_count,
        "party_count": party_count,
        "open_infractions": open_infractions,
        "open_incidents": open_incidents,
        "open_issues": open_issues,
        "overdue_notice_infractions": [
            {
                "id": i.id,
                "lot_number": i.lot.strata_lot_number if i.lot else None,
                "unit_number": i.lot.unit_number if i.lot else None,
                "party_name": i.primary_party.full_name if i.primary_party else None,
            }
            for i in overdue_notice_infs
        ],
        "overdue_issues": [
            {
                "id": i.id,
                "title": i.title,
                "due_date": i.due_date.isoformat() if i.due_date else None,
                "priority": i.priority.value,
                "assignee_email": i.assignee.email if i.assignee else None,
            }
            for i in overdue_issues
        ],
        "recent_audit": [
            {
                "id": e.id,
                "actor_email": e.actor_email,
                "action": e.action,
                "entity_type": e.entity_type,
                "entity_id": e.entity_id,
                "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None,
            }
            for e in recent_audit
        ],
    }


@app.get(f"{API_PREFIX}/health")
def health():
    return {"status": "ok"}
