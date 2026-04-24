# Product Context

## Why This Project Exists
The Spectrum 4 strata council previously managed ownership records, bylaw enforcement, and communications through spreadsheets and email threads. This was error-prone, lacked audit trails, and made it difficult to track infraction lifecycles in compliance with the BC Strata Property Act (s.135).

## Problems It Solves
1. **Ownership tracking**: Centralized database of 245 lots with owner/tenant assignments, contact methods, and historical records
2. **Bylaw enforcement**: Full s.135-compliant lifecycle from complaint → notice → response → hearing → fine/dismissal, with append-only event trail
3. **Quarterly imports**: Parses PDF owner lists from the management company (Gateway), detects duplicates, and provides staged review before committing
4. **Communications**: Generates formal notice PDFs, sends via email, and syncs resident mailing list to Listmonk
5. **Accountability**: Every action is logged in an append-only audit log with actor, timestamp, and IP address

## User Experience Goals
- Clean, responsive SPA (React + Tailwind) that works on desktop and tablet
- Minimal clicks for common tasks (recording infractions, generating notices)
- Clear visual indicators for overdue items and attention-required records
- Role-appropriate views (auditors see read-only, admins see everything)
- First-run experience: seed database with 245 lots and admin credentials printed to logs
