# DEC-002: XLSX import creates new products only

- Status: Accepted
- Date: 2026-07-30

## Decision

Supabase PostgreSQL remains the authoritative product database. XLSX is an
exchange format, not a second database.

Product import is create-only:

- Every imported product is created as `DRAFT`.
- If a case-insensitive Product Code or slug already exists, validation fails.
- Import never overwrites or updates an existing product.
- Validation and preview do not mutate business data.
- Confirmed imports must use the same database rules and Activity Logs as the
  product management UI.

Export is read-only and is generated according to the requesting user's role.
Warehouse exports must not contain costs, shipping prices, or currency.

## Consequences

Existing products are updated only through the authenticated Product editor.
Future bulk-update requirements need a separate reviewed decision and workflow.

