# Technical Context

## Technology Stack

### Backend
- **Python 3.12** (slim-bookworm)
- **FastAPI 0.115.5** with uvicorn
- **SQLAlchemy 2.0.36** ORM
- **Alembic 1.14.0** migrations
- **PostgreSQL 16** (Alpine)
- **Pydantic 2.10.3** / pydantic-settings
- **WeasyPrint 62.3** PDF generation
- **pdfplumber 0.11.4** PDF parsing
- **bcrypt 4.2.1** password hashing
- **slowapi 0.1.9** rate limiting
- **structlog 24.4.0** structured logging
- **httpx 0.28.1** HTTP client (Listmonk sync)
- **Starlette SessionMiddleware** for sessions
- **itsdangerous** for session signing

### Frontend
- **React 18.3.1** with TypeScript 5.7
- **Vite 6.0.5** build tool
- **React Router DOM 6.28.0**
- **TanStack React Query 5.62.3**
- **TanStack React Table 8.20.5**
- **Tailwind CSS 3.4.17**
- **Lucide React 0.468.0** icons
- **Nginx 1.27** (Alpine) for serving + reverse proxy

### Infrastructure
- **Docker Compose** for local dev and production
- **Coolify** for production deployment
- **Traefik** for TLS termination and routing
- **OpenSMTPD** relay for transactional email
- **Listmonk** for bulk email campaigns

## Development Setup
```bash
docker compose up --build          # Full stack
docker compose up db api           # API + DB only, frontend locally
cd web && npm install && npm run dev  # Frontend dev server (hot reload)
```

## Environment Variables
| Variable | Default | Purpose |
|----------|---------|---------|
| DB_PASSWORD | changeme | PostgreSQL password |
| DATABASE_URL | auto-built | Override full connection string |
| SECRET_KEY | dev placeholder | Session signing (32+ chars) |
| DEBUG | false | Enable API docs |
| HTTPS_ONLY | false | Secure cookie flag |
| SAME_SITE | lax | SameSite policy |
| SMTP_HOST/PORT | 10.0.9.1:10025 | OpenSMTPD relay |
| MAIL_FROM | crm@spectrum4.ca | Sender address |
| LISTMONK_* | various | Listmonk API credentials |
| UPLOADS_DIR | /app/uploads | File storage path |

## Key Files & Structure

### API (`api/`)
- `app/main.py` - FastAPI app, lifespan, seeding, dashboard stats
- `app/config.py` - Pydantic settings
- `app/database.py` - SQLAlchemy engine/session
- `app/models.py` - All ORM models (20+ models)
- `app/models_import.py` - Import staging models
- `app/dependencies.py` - Auth/CSRF/role dependencies
- `app/audit.py` - Audit logging helper
- `app/email.py` - Transactional email via SMTP
- `app/routers/` - API route handlers (auth, lots, parties, bylaws, infractions, incidents, issues, documents, sync)
- `app/schemas/` - Pydantic request/response schemas
- `app/notices/` - Notice PDF generation
- `app/pdf_import/` - PDF parsing and import logic
- `alembic/` - Database migrations

### Web (`web/`)
- `src/App.tsx` - Router setup with auth guard
- `src/lib/api.ts` - Typed API client + all domain types
- `src/hooks/useAuth.ts` - Auth hooks (useMe, useLogin, useLogout)
- `src/components/layout/` - Layout + Sidebar
- `src/pages/` - Page components (Dashboard, Lots, Parties, Bylaws, Infractions, Incidents, Issues)

## Database Models (20+)
- **System**: User, AuditLog
- **Core**: StrataCorporation, Party, Lot, Document
- **Contact**: ContactMethod, LotAssignment
- **Bylaw**: Bylaw, FineSchedule
- **Enforcement**: Infraction, InfractionEvent, Notice
- **Operations**: Incident, Issue, CommunicationsLog
- **Import**: ImportBatch, ImportStagedLot, ImportStagedParty
