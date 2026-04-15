# Spectrum 4 Strata CRM

Self-hosted strata management system for **Strata Plan BCS2611** (Spectrum 4, Vancouver).
Replaces ad-hoc spreadsheets and email threads for ownership tracking, bylaw enforcement,
and council communications.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Prerequisites](#prerequisites)
3. [Coolify Deployment](#coolify-deployment)
4. [Environment Variables](#environment-variables)
5. [First Login](#first-login)
6. [Operations Runbook](#operations-runbook)
7. [Development Setup](#development-setup)
8. [Feature Reference](#feature-reference)

---

## Architecture

```
Internet → Traefik (Let's Encrypt TLS) → web (nginx:1.27)
                                               │
                                    /api/ proxy │
                                               ↓
                                         api (FastAPI)
                                               │
                                     SQLAlchemy │
                                               ↓
                                         db (PostgreSQL 16)
                                               
                                  api also calls:
                                    - OpenSMTPD relay (10.0.9.1:10025) for transactional email
                                    - Listmonk (http://listmonk:9000) for bulk audience sync
```

**Services:**

| Service | Image | Role |
|---------|-------|------|
| `db` | `postgres:16-alpine` | Persistent data store |
| `api` | `./api` (Python 3.12 / FastAPI) | REST API, PDF generation, business logic |
| `web` | `./web` (React 18 + nginx) | SPA frontend + API reverse proxy |

**Volumes:**

| Volume | Contents |
|--------|----------|
| `postgres_data` | PostgreSQL data directory |
| `uploads` | Notice PDFs and uploaded documents (mounted at `/app/uploads` in `api`) |

---

## Prerequisites

Before deploying, ensure the following exist on your Coolify VPS:

- **Coolify** with its built-in Traefik instance running (handles TLS and routing)
- **OpenSMTPD relay** on `10.0.9.1:10025` (or update `SMTP_HOST`/`SMTP_PORT`)
- **Listmonk** accessible at `http://listmonk:9000` on the same Docker network, or at a reachable URL
- DNS record: `crm.spectrum4.ca` → your VPS IP

> **Note:** The CRM uses its own bundled PostgreSQL container. If you prefer to use
> Coolify's shared database instance, set `DATABASE_URL` to point at it and remove
> the `db` service from both compose files.

---

## Coolify Deployment

### 1. Add the project

In Coolify:
1. **New Resource → Docker Compose** (or "Docker Compose from Git")
2. Connect your Git repository (or upload files directly)
3. Set **Compose File** → `docker-compose.yml`
4. Set **Compose Override File** → `docker-compose.prod.yml`

### 2. Set environment variables

In Coolify's **Environment** tab, add every variable from the table below.
At minimum you must set:

```
DB_PASSWORD         # strong random password
SECRET_KEY          # minimum 32 random characters — see tip below
HTTPS_ONLY=true
SAME_SITE=strict
```

**Generate a SECRET_KEY:**
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 3. Configure the domain

In Coolify's **Domains** tab:
- Domain: `crm.spectrum4.ca`
- Service: `web`
- Port: `80`
- Enable Let's Encrypt TLS

> Coolify will inject the Traefik labels automatically, or use the labels
> already defined in `docker-compose.prod.yml`. You may remove the labels from
> `docker-compose.prod.yml` if Coolify manages them through its UI.

### 4. Deploy

Click **Deploy** in Coolify. On first start the API will:

1. Run all Alembic migrations (`001_initial_schema` → `002_import_staging` → `003_seed_bylaws`)
2. Seed: strata corporation (BCS2611), 245 empty lots (SL1–SL245), one admin user
3. Print first-run credentials to Docker logs — **retrieve before they scroll off**

```bash
# Retrieve from Coolify's log viewer, or via SSH:
docker logs <api_container_name> 2>&1 | grep "FIRST-RUN CREDENTIALS" -A 4
```

---

## Environment Variables

All variables go in Coolify's Environment UI (or a `.env` file for local dev).

| Variable | Default | Required in prod | Description |
|----------|---------|-----------------|-------------|
| `DB_PASSWORD` | `changeme` | **Yes** | PostgreSQL password for `spectrum4` user |
| `DATABASE_URL` | auto-built from `DB_PASSWORD` | No | Override full connection string (e.g. external DB) |
| `SECRET_KEY` | dev placeholder | **Yes** | 32+ char random string for session signing |
| `DEBUG` | `false` | No | Enables `/api/docs`, `/api/redoc`. Keep `false` in prod |
| `HTTPS_ONLY` | `false` | **Yes** (`true`) | Sets `Secure` flag on session cookie |
| `SAME_SITE` | `lax` | **Yes** (`strict`) | SameSite session cookie policy |
| `SMTP_HOST` | `10.0.9.1` | No | OpenSMTPD relay host |
| `SMTP_PORT` | `10025` | No | OpenSMTPD relay port |
| `MAIL_FROM` | `crm@spectrum4.ca` | No | From address for transactional email |
| `MAIL_FROM_NAME` | `Spectrum 4 Strata Council` | No | From display name |
| `LISTMONK_BASE_URL` | `http://listmonk:9000` | No | Listmonk API base URL |
| `LISTMONK_USERNAME` | `listmonk` | No | Listmonk admin username |
| `LISTMONK_PASSWORD` | `changeme` | No | Listmonk admin password |
| `UPLOADS_DIR` | `/app/uploads` | No | Container path for uploaded files (already volume-mounted) |

---

## First Login

1. Retrieve the temporary password from Docker logs (see step 4 of deployment)
2. Navigate to `https://crm.spectrum4.ca`
3. Log in with `admin@spectrum4.ca` and the temporary password
4. You will be prompted to change your password immediately
5. Create additional user accounts under the admin role as needed

**User roles:**

| Role | Permissions |
|------|-------------|
| `admin` | Full access, user management |
| `council_member` | Read + write all records |
| `property_manager` | Read + write all records |
| `auditor` | Read-only |

---

## Operations Runbook

### Quarterly owner list import

The management company (Gateway) provides a PDF owner list each quarter.

1. Navigate to **Import** in the sidebar
2. Drag and drop the PDF
3. The system parses it and flags duplicates (same party appearing in multiple lots)
4. Review each lot: confirm, merge duplicate parties, or skip
5. Once all lots are processed the batch is complete
6. Check the **Diff** view to see parties who have departed since the last import

### Recording a bylaw infraction

1. Navigate to **Infractions → Record Infraction**
2. Select the lot, the respondent party, and the bylaw violated
3. Enter the complaint received date and description (keep vague — complaint source is confidential)
4. The system auto-calculates the occurrence number (1st, 2nd, 3rd+) for this lot+bylaw combination
5. Click **Generate Notice** to produce the s.135 PDF and optionally email it
6. As the infraction progresses, use **Record Event** to advance through the lifecycle:
   `open → notice_sent → response_received → [hearing_scheduled] → fined | dismissed`

> **s.135 compliance:** Every status transition is recorded as an append-only event.
> Do not skip steps. The event trail is the legal record.

### Syncing the Listmonk mailing list

1. Navigate to **Dashboard**
2. Click **Sync Residents to Listmonk**
3. The system queries all current owners and tenants with email addresses and upserts
   them into the **Spectrum 4 Residents** list in Listmonk (creating the list on first run)

### Backup and restore

The `uploads` volume (notice PDFs, documents) and `postgres_data` volume must both be backed up.

**Database backup:**
```bash
docker exec <db_container> pg_dump -U spectrum4 spectrum4_crm > backup_$(date +%Y%m%d).sql
```

**Database restore:**
```bash
cat backup_YYYYMMDD.sql | docker exec -i <db_container> psql -U spectrum4 spectrum4_crm
```

**Uploads backup:** Use borgmatic, restic, or rsync on the Docker volume mount path.

On Coolify, the volume path is typically `/var/lib/docker/volumes/<stack_name>_uploads/_data`.

### Resetting the admin password

```bash
docker exec -it <api_container> python3 -c "
import bcrypt
from app.database import SessionLocal
from app.models import User
db = SessionLocal()
u = db.query(User).filter(User.email == 'admin@spectrum4.ca').first()
u.password_hash = bcrypt.hashpw(b'NewTemporaryPass1!', bcrypt.gensalt(12)).decode()
u.password_reset_required = True
db.commit()
print('Done')
"
```

### Running migrations manually

Migrations run automatically on container start. To run manually:
```bash
docker exec <api_container> alembic upgrade head
```

To check current migration state:
```bash
docker exec <api_container> alembic current
```

---

## Development Setup

```bash
# 1. Clone and copy env
git clone <repo>
cd crm
cp .env.example .env
# Edit .env: set DB_PASSWORD and SECRET_KEY

# 2. Start the full stack
docker compose up --build

# OR run API and DB in Docker, frontend locally:
docker compose up db api

# 3. Start the React dev server (hot reload, proxies /api/ to localhost:8000)
cd web
npm install
npm run dev
# → http://localhost:5173

# 4. First-run admin credentials
docker compose logs api | grep -A 4 "FIRST-RUN"
```

**API docs** (DEBUG mode only): `http://localhost:8000/api/docs`

**TypeScript type check:**
```bash
cd web && node_modules/.bin/tsc --noEmit
```

**Run backend tests:**
```bash
docker compose exec api pytest tests/ -v
```

---

## Feature Reference

| Section | Route | Description |
|---------|-------|-------------|
| Dashboard | `/dashboard` | Stats (lots, parties, open infractions/incidents/issues), attention alerts, Listmonk sync, audit log |
| Lots | `/lots` | All 245 strata lots; search by unit/SL number; assign owners/tenants |
| Parties | `/parties` | Owners, tenants, property managers; contact methods; assignment history |
| Import | `/import` | Quarterly owner list PDF import with duplicate detection and staged review |
| Bylaws | `/bylaws` | Versioned bylaw library with fine schedules |
| Infractions | `/infractions` | s.135-compliant bylaw contravention lifecycle; notice PDF generation; email delivery |
| Incidents | `/incidents` | Property and common area incident log |
| Issues | `/issues` | Maintenance and council action items with priority, due dates, assignees |
| Communications | *(coming)* | Listmonk bulk send log and manual communications record |

### Not in v1 scope

- Owner self-service portal
- Accounting / strata fee tracking
- AGM management
- Inbound email parsing
- Mobile app
