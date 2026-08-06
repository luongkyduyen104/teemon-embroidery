# DEC-003: Catalog fulfillment visibility

## Decision

- Published product weight by size is public and may be shown to visitors.
- Base cost and regional shipping estimates are internal catalog data.
- Every active authenticated staff account (`sales`, `warehouse`, or `admin`) may view base cost, weight, currency, and regional shipping estimates.
- Only administrators may create or update fulfillment data.
- Public database responses must not include base cost, shipping estimates, or currency.

## Shipping regions

- United States
- Canada
- Europe
- United Kingdom
- Australia
- Rest of World

## Superseded rule

This decision supersedes the earlier restriction that prevented Warehouse accounts from viewing pricing data.
