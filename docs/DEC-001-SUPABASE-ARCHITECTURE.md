# DEC-001 - Continue with Supabase architecture

Status: Accepted

Date: 2026-07-29

Decision owner: Duyen Luong

## Context

The original Product Catalog System Specification v1.0 approved Next.js,
NestJS, PostgreSQL, Redis and S3-compatible storage. During the prototype,
package installation and local runtime usage caused sustained resource pressure
on the development computer.

The working prototype now uses:

- HTML/CSS/JavaScript served by Live Server.
- Supabase Auth for internal accounts and sessions.
- Supabase PostgreSQL for application data.
- Row Level Security for database authorization.
- Supabase Edge Functions for privileged server operations.
- Supabase Storage as the preferred future image/chart storage.

## Decision

Continue the project with Supabase as the backend platform.

The approved runtime architecture is therefore revised as follows:

- Frontend: current HTML/CSS/JavaScript prototype; component framework may be
  introduced later only when justified.
- Backend: Supabase Edge Functions.
- Database: Supabase PostgreSQL.
- Authentication/session: Supabase Auth.
- Authorization: RLS plus server-side checks in Edge Functions.
- Object storage: Supabase Storage.
- Schema changes: versioned SQL migrations committed to the repository.

## Rules retained from the specification

- Roles and business permissions remain unchanged.
- Root Admin remains `role=admin` plus `is_root_admin=true`.
- Server/database authorization remains authoritative.
- Warehouse data must not expose pricing, shipping or currency.
- Important mutations require immutable Activity Logs.
- Product, Variant, SKU, fulfillment and publish rules remain unchanged.
- No schema or workflow changes without a new DEC.

## Consequences

- NestJS, Redis, Docker Compose and a separate S3 adapter are not required for
  the first production release.
- Cookie/CSRF requirements from the original NestJS design are replaced by
  Supabase session/JWT controls appropriate to the browser client.
- Security acceptance tests must cover RLS and Edge Function authorization.
- Secret/service-role keys may exist only in Supabase server environments.
- Public browser code may use only the publishable key.
- Session timeout and revocation behavior must be explicitly configured and
  tested against the specification targets.

## Follow-up work

1. Complete Phase 1 authorization acceptance.
2. Add immutable Activity Logs before adding more privileged mutations.
3. Add session revocation and timeout controls.
4. Build all future data features using migrations, RLS and Edge Functions.
