# Active Context

## Current State
The CRM is fully functional with all core features implemented:
- Lot and party management with assignment tracking
- Bylaw library with fine schedules
- s.135-compliant infraction lifecycle with PDF notice generation
- Incident and issue tracking
- Quarterly owner list PDF import pipeline
- Listmonk mailing list sync
- Dashboard with stats and attention alerts
- Role-based access control and audit logging
- **Forgot password flow** — users can request a password reset email and set a new password via a time-limited token
- **User management** — admin-only page for managing user accounts, roles, passwords, and account status
- **Activity log** — dedicated paginated audit log page with filtering by action type and entity type
- **Fully responsive UI** — all pages adapt to mobile, tablet, and desktop viewports

## Recent Changes
- **Responsive UI overhaul** — entire application made fully responsive:
  - **Sidebar**: Transformed into an overlay drawer on mobile (`fixed` with slide transition) and static sidebar on desktop (`lg:static`). Backdrop overlay closes sidebar on tap.
  - **Mobile header**: Sticky top bar with hamburger menu button, hidden on `lg:` breakpoint and above.
  - **SidebarContext**: React context (`useSidebar.tsx`) manages open/close/toggle state for the mobile sidebar drawer.
  - **Page containers**: All pages use `p-4 md:p-6 lg:p-8 max-w-7xl mx-auto` for consistent responsive padding.
  - **Headers**: `flex flex-col sm:flex-row sm:items-center justify-between gap-2` pattern for stacking on mobile.
  - **Action buttons**: `self-start sm:self-auto` alignment with hidden text on mobile (`<span className="hidden sm:inline">Full</span><span className="sm:hidden">Short</span>`).
  - **Search/filter bars**: `flex flex-col sm:flex-row gap-2` to stack vertically on mobile.
  - **Tables**: Wrapped in `overflow-x-auto` with `min-w-[XXXpx]` on the table element for horizontal scroll on small screens.
  - **Cards**: `-mx-4 sm:mx-0` for edge-to-edge display on mobile, normal margins on larger screens.
  - **Stat cards**: Responsive padding `px-3 md:px-4`, icon sizing `w-9 h-9 md:w-11 md:h-11`, text sizing `text-xl md:text-2xl`.
  - **Pagination**: `flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2` for stacking on mobile.
  - **Modals**: Bottom-sheet style on mobile (`items-end sm:items-center` with `rounded-t-xl sm:rounded-xl`), centered dialog on desktop. Footer buttons stack in reverse order on mobile (`flex-col-reverse sm:flex-row`).
  - **Form grids**: `grid grid-cols-1 sm:grid-cols-2 gap-4` to stack form fields on mobile.
- **SMTP authentication fix**: Added `smtp_username` and `smtp_password` config fields to support authenticated SMTP relay. The `send_email` function now calls `smtp.login()` when credentials are provided. Updated `.env.example` with the new variables.

## Active Decisions
- Session-based auth (not JWT) - simpler for SPA with same-domain deployment
- Non-destructive import strategy - existing assignments not auto-ended on re-import
- WeasyPrint for PDF generation (HTML template → PDF)
- pdfplumber for PDF parsing (table extraction with column group detection)
- Append-only event trail for s.135 compliance
- Password reset token stored as SHA-256 hash — raw token never persisted in DB
- 1-hour token expiry — limits window of attack
- No email enumeration — forgot-password endpoint always returns 200
- No CSRF on forgot/reset endpoints — user isn't logged in, so session-based CSRF doesn't apply
- **Admin user management requires admin role** — all user management endpoints use `require_admin` dependency
- **Self-deactivation prevented** — admin cannot deactivate their own account via the update endpoint
- **Temporary password vs direct reset** — two distinct admin actions: direct reset (password set, no forced change) vs assign temporary password (password set, `password_reset_required=True`)
- **Audit log pagination** — 50 entries per page with server-side skip/limit, action and entity_type filters passed as query params
- **Single sidebar element** — one `<aside>` element that switches between mobile overlay drawer and desktop static sidebar via Tailwind responsive classes, avoiding DOM duplication
- **Bottom-sheet modals on mobile** — modals slide up from bottom on small screens (`items-end` + `rounded-t-xl`) and center on desktop (`sm:items-center` + `sm:rounded-xl`)
- **Responsive breakpoint at `lg:`** — sidebar switches from overlay to static at the `lg:` (1024px) breakpoint

## Next Steps / Known Gaps
- Communications page (Listmonk bulk send log) marked as "coming"
- Owner self-service portal not in scope
- Accounting / strata fee tracking not in scope
- AGM management not in scope
- Inbound email parsing not in scope
- Mobile app not in scope
- Import diff view shows departed parties but requires manual action to end assignments
- No bulk-end feature for departed parties

## Important Patterns
- All mutating endpoints require CSRF token (except forgot-password and reset-password which are pre-auth)
- Audit logging is manual (caller must call log_action + commit)
- Infraction events are append-only; complaint_received is auto-recorded at creation
- Notice generation auto-advances status to notice_sent
- Fine amounts auto-looked up from fine schedule when fine_levied event recorded
- Admin user management endpoints all use `require_admin` for authorization
- User creation sets `password_reset_required=True` to force first-login password change
- Email uniqueness is enforced at the application level (409 Conflict on duplicate)
- Dashboard shows last 5 audit entries; full audit log available at `/audit-log` with pagination and filters
- Responsive pattern: mobile-first with unprefixed utilities, `sm:` for tablet, `md:` for small desktop, `lg:` for large desktop
- Sidebar state managed via React Context (`SidebarProvider` wrapping the app in Layout.tsx)
- SMTP relay authentication: `smtp.login()` called when `smtp_username` is non-empty
