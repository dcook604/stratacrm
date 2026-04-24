# System Patterns & Architecture

## Architecture Overview
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
                                    - OpenSMTPD relay for transactional email
                                    - Listmonk for bulk audience sync
```

## Service Architecture

### db (PostgreSQL 16 Alpine)
- Single database: `spectrum4_crm`
- User: `spectrum4`
- Volume: `postgres_data` for persistence
- Internal only (no port exposure in production)

### api (Python 3.12 / FastAPI)
- REST API with SQLAlchemy 2.0 ORM
- Alembic migrations run on container start
- WeasyPrint for PDF generation (s.135 notices)
- pdfplumber for owner list PDF parsing
- Session-based auth with CSRF protection
- Rate limiting via slowapi
- Structured logging via structlog

### web (React 18 + Vite + nginx)
- React SPA with React Router v6
- TanStack React Query for data fetching
- Tailwind CSS for styling
- Lucide React for icons
- Nginx serves static files and proxies /api/ to backend

## Key Design Patterns

### Authentication & Security
- Session-based auth (server-side sessions via Starlette SessionMiddleware)
- CSRF token returned on login, required for mutating requests
- Password hashing with bcrypt (12 rounds)
- Rate limiting: 10 login attempts per 15 minutes
- Role-based access control via dependency injection (`require_role`, `require_write`, `require_admin`)

### s.135 Compliance (Infraction Lifecycle)
- Append-only event trail (`InfractionEvent` model)
- State machine with explicit transition rules (`_TRANSITIONS` dict)
- Status flow: `open → notice_sent → response_received → [hearing_scheduled] → fined | dismissed`
- Each status change records actor, timestamp, and notes
- Notice PDF generation via WeasyPrint with formal template

### Import Pipeline
1. PDF uploaded → parsed by `pdfplumber` into column groups
2. Staged in `ImportStagedLot`/`ImportStagedParty` tables
3. Duplicate detection against existing parties
4. User reviews each lot (create/merge/skip)
5. On confirmation, parties created/merged and assignments created
6. Batch marked complete when all lots processed

### Audit Logging
- Centralized `log_action()` function in `app/audit.py`
- Records: actor, action type, entity type/ID, before/after changes, IP address, timestamp
- Caller must commit the session
- Used across all routers for create/update/delete/import/login/logout

### Data Layer
- SQLAlchemy 2.0 DeclarativeBase models
- Session-per-request pattern via FastAPI dependency
- Connection pooling (pool_size=10, max_overflow=20)
- Alembic for schema migrations (5 migrations so far)
