# Project Brief: Spectrum 4 Strata CRM

## Core Mission
A self-hosted strata management system for **Strata Plan BCS2611** (Spectrum 4, Vancouver). Replaces ad-hoc spreadsheets and email threads for ownership tracking, bylaw enforcement, and council communications.

## Key Requirements
- Track 245 strata lots with ownership/tenant assignments
- Quarterly owner list PDF import with duplicate detection
- s.135-compliant bylaw infraction lifecycle management
- Notice PDF generation and email delivery
- Incident and issue tracking
- Listmonk mailing list synchronization
- Role-based access control (admin, council_member, property_manager, auditor)
- Audit logging for all actions

## Target Deployment
- Coolify VPS with Traefik (Let's Encrypt TLS)
- Domain: crm.spectrum4.ca
- Docker Compose stack (3 services: db, api, web)
