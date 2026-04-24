# Progress

## What Works
- ✅ Full-stack Docker Compose setup (dev + prod)
- ✅ Database schema with Alembic migrations (6 migrations)
- ✅ First-run seeding (strata corp, 245 lots, admin user)
- ✅ Session-based authentication with CSRF protection
- ✅ Role-based access control (admin, council_member, property_manager, auditor)
- ✅ Lot CRUD with search by unit/SL number
- ✅ Party CRUD with contact methods
- ✅ Lot assignment management (create/update/delete)
- ✅ Bylaw library with versioning and fine schedules
- ✅ s.135 infraction lifecycle with event trail
- ✅ Notice PDF generation (WeasyPrint)
- ✅ Notice email delivery via SMTP relay
- ✅ Incident tracking
- ✅ Issue tracking with priorities and assignees
- ✅ Document upload/download
- ✅ Dashboard with stats, overdue items, audit log
- ✅ Quarterly owner list PDF import with duplicate detection
- ✅ Listmonk mailing list sync
- ✅ Audit logging for all actions
- ✅ Rate limiting on login
- ✅ Production deployment via Coolify + Traefik
- ✅ **Forgot password flow** — email-based password reset with time-limited tokens
- ✅ **User management** — admin page to list, create, edit, deactivate users; reset passwords and assign temporary passwords
- ✅ **Activity log** — dedicated paginated audit log page with action/entity filters
- ✅ **Responsive UI** — all pages adapt to mobile, tablet, and desktop viewports:
  - Mobile sidebar overlay drawer with backdrop
  - Responsive page containers, headers, and action buttons
  - Horizontally scrollable tables on small screens
  - Bottom-sheet modals on mobile, centered dialogs on desktop
  - Stacking form layouts on mobile (grid → single column)
  - Edge-to-edge cards on mobile with negative margins

## What's Left to Build
- ❌ Communications page (Listmonk bulk send log)
- ❌ Owner self-service portal (not in v1 scope)
- ❌ Accounting / strata fee tracking (not in v1 scope)
- ❌ AGM management (not in v1 scope)
- ❌ Inbound email parsing (not in v1 scope)
- ❌ Mobile app (not in v1 scope)

## Known Issues
- Import diff view shows departed parties but requires manual action to end assignments
- No bulk-end feature for departed parties
- No automated backup solution (manual pg_dump documented)
- No automated testing for frontend
- Limited backend tests (only test_parser.py exists)

## Evolution of Decisions
- **Session auth over JWT**: Simpler for same-domain SPA, no token refresh complexity
- **WeasyPrint over ReportLab**: HTML template easier to maintain and style
- **pdfplumber over PyMuPDF**: Better table extraction for structured PDF data
- **Non-destructive import**: Safer default; manual cleanup of departed parties
- **Append-only events**: Legal compliance requirement for s.135
- **Password reset token as SHA-256 hash**: Raw token never persisted in DB; only hash stored for comparison
- **No email enumeration on forgot-password**: Always returns 200 regardless of whether email exists
- **Single sidebar element**: One `<aside>` switches between mobile overlay and desktop static via Tailwind responsive classes
- **Bottom-sheet modals**: Mobile modals slide up from bottom (`items-end` + `rounded-t-xl`), center on desktop (`sm:items-center` + `sm:rounded-xl`)
- **SMTP authentication**: Added `smtp_username`/`smtp_password` config for authenticated relay; `smtp.login()` called when credentials provided
