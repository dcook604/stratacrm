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
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.database import SessionLocal, get_db
from app.models import Lot, StrataCorporation, User, UserRole
from app.routers import auth as auth_router
from app.routers import lots as lots_router
from app.routers import parties as parties_router
from app.routers import bylaws as bylaws_router
from app.routers import infractions as infractions_router
from app.routers import incidents as incidents_router
from app.routers import issues as issues_router
from app.routers import documents as documents_router
from app.routers import sync as sync_router
from app.routers import share as share_router
from app.routers import email_ingest as email_ingest_router
from app.routers import dashboard as dashboard_router
from app.routers import search as search_router
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


_SL_TO_UNIT = {
    1: "133", 2: "137", 3: "139", 4: "650", 5: "638", 6: "636", 7: "632",
    8: "630", 9: "628", 10: "626", 11: "622", 12: "150", 13: "138",
    14: "132", 15: "128", 16: "122", 17: "118", 18: "112", 19: "110",
    20: "506", 21: "507", 22: "508", 23: "509", 24: "501", 25: "502",
    26: "503", 27: "505", 28: "606", 29: "607", 30: "608", 31: "609",
    32: "601", 33: "602", 34: "603", 35: "605", 36: "706", 37: "707",
    38: "708", 39: "709", 40: "701", 41: "702", 42: "703", 43: "705",
    44: "806", 45: "807", 46: "808", 47: "809", 48: "801", 49: "802",
    50: "803", 51: "805", 52: "906", 53: "907", 54: "908", 55: "909",
    56: "901", 57: "902", 58: "903", 59: "905", 60: "1006", 61: "1007",
    62: "1008", 63: "1009", 64: "1001", 65: "1002", 66: "1003", 67: "1005",
    68: "1106", 69: "1107", 70: "1108", 71: "1109", 72: "1101", 73: "1102",
    74: "1103", 75: "1105", 76: "1206", 77: "1207", 78: "1208", 79: "1209",
    80: "1201", 81: "1202", 82: "1203", 83: "1205", 84: "1506", 85: "1507",
    86: "1508", 87: "1509", 88: "1501", 89: "1502", 90: "1503", 91: "1505",
    92: "1606", 93: "1607", 94: "1608", 95: "1609", 96: "1601", 97: "1602",
    98: "1603", 99: "1605", 100: "1706", 101: "1707", 102: "1708",
    103: "1709", 104: "1701", 105: "1702", 106: "1703", 107: "1705",
    108: "1806", 109: "1807", 110: "1808", 111: "1809", 112: "1801",
    113: "1802", 114: "1803", 115: "1805", 116: "1906", 117: "1907",
    118: "1908", 119: "1909", 120: "1901", 121: "1902", 122: "1903",
    123: "1905", 124: "2006", 125: "2007", 126: "2008", 127: "2009",
    128: "2001", 129: "2002", 130: "2003", 131: "2005", 132: "2106",
    133: "2107", 134: "2108", 135: "2109", 136: "2101", 137: "2102",
    138: "2103", 139: "2105", 140: "2206", 141: "2207", 142: "2208",
    143: "2209", 144: "2201", 145: "2202", 146: "2203", 147: "2205",
    148: "2306", 149: "2307", 150: "2308", 151: "2309", 152: "2301",
    153: "2302", 154: "2303", 155: "2305", 156: "2506", 157: "2507",
    158: "2508", 159: "2509", 160: "2501", 161: "2502", 162: "2503",
    163: "2505", 164: "2606", 165: "2607", 166: "2608", 167: "2609",
    168: "2601", 169: "2602", 170: "2603", 171: "2605", 172: "2706",
    173: "2707", 174: "2708", 175: "2709", 176: "2701", 177: "2702",
    178: "2703", 179: "2705", 180: "2806", 181: "2807", 182: "2808",
    183: "2809", 184: "2801", 185: "2802", 186: "2803", 187: "2805",
    188: "2906", 189: "2907", 190: "2908", 191: "2909", 192: "2901",
    193: "2902", 194: "2903", 195: "2905", 196: "3006", 197: "3007",
    198: "3008", 199: "3009", 200: "3001", 201: "3002", 202: "3003",
    203: "3005", 204: "3106", 205: "3107", 206: "3108", 207: "3109",
    208: "3101", 209: "3102", 210: "3103", 211: "3105", 212: "3206",
    213: "3207", 214: "3208", 215: "3209", 216: "3201", 217: "3202",
    218: "3203", 219: "3205", 220: "3306", 221: "3307", 222: "3308",
    223: "3309", 224: "3301", 225: "3302", 226: "3303", 227: "3305",
    228: "3506", 229: "3507", 230: "3508", 231: "3509", 232: "3501",
    233: "3502", 234: "3503", 235: "3505", 236: "3606", 237: "3607",
    238: "3608", 239: "3609", 240: "3601", 241: "3602", 242: "3603",
    243: "3605", 244: "3701", 245: "3702",
}


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

        # 2. 245 lots with their permanent unit numbers
        for sl, unit in _SL_TO_UNIT.items():
            db.add(Lot(strata_corporation_id=corp.id, strata_lot_number=sl, unit_number=unit))

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

    from apscheduler.schedulers.background import BackgroundScheduler
    from app.services.email_ingest import scheduler_tick

    def _tick():
        db = SessionLocal()
        try:
            scheduler_tick(db)
        except Exception:
            log.exception("email_ingest_scheduler_tick_failed")
        finally:
            db.close()

    scheduler = BackgroundScheduler()
    scheduler.add_job(_tick, "interval", minutes=1, id="email_ingest_tick")
    scheduler.start()
    log.info("email_ingest_scheduler_started")

    yield

    scheduler.shutdown(wait=False)


app = FastAPI(
    title="Spectrum 4 Strata CRM",
    version="1.0.0",
    docs_url="/api/docs" if settings.debug else None,
    redoc_url="/api/redoc" if settings.debug else None,
    openapi_url="/api/openapi.json" if settings.debug else None,
    lifespan=lifespan,
)

# Make settings accessible from app.state (used by dependencies)
app.state.settings = settings

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
    max_age=8 * 3600,              # 8 hours (matches absolute timeout in dependencies.py)
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
app.include_router(bylaws_router.router, prefix=API_PREFIX)
app.include_router(infractions_router.router, prefix=API_PREFIX)
app.include_router(incidents_router.router, prefix=API_PREFIX)
app.include_router(issues_router.router, prefix=API_PREFIX)
app.include_router(documents_router.router, prefix=API_PREFIX)
app.include_router(sync_router.router, prefix=API_PREFIX)
app.include_router(share_router.router, prefix=API_PREFIX)
app.include_router(email_ingest_router.router, prefix=API_PREFIX)
app.include_router(dashboard_router.router, prefix=API_PREFIX)
app.include_router(search_router.router, prefix=API_PREFIX)

@app.get(f"{API_PREFIX}/health")
def health(db = Depends(get_db)):
    from sqlalchemy import text
    try:
        db.execute(text("SELECT 1")).scalar()
    except Exception:
        return JSONResponse(status_code=503, content={"status": "unhealthy"})
    return {"status": "ok"}
