# a-search DB migrations (FR-251 / FR-196)

**Target databases:** `a_search` (live) and `a_search_sandbox` (sandbox).

**CAST IRON:** never run these scripts against **madeiradb**. madeiradb is read-only for a-search (FR-251 / #1365). Club/partner identity is read from `mdb.*` views only.

## Scripts

| file | purpose |
|------|---------|
| `001_Customers.sql` | ComponentsPiece Customers row: host, customerNumber, approved (default 0), DNS cache fields, upgradeStatus columns (FR-196 / #1345 webhook writers) |
| `002_Widgets.sql` | Widgets registry: widgetGuid PK, customerNumber/host nullable until bind (FR-232 rule 3) |

Migrate-once: each script uses `IF OBJECT_ID ... IS NULL` / `IF NOT EXISTS` index guards.

## Helpers

Node helpers for unit tests and later Lambda wiring:

- `shared/components/customers.js` -- `ensureCustomer`, `getCustomerByHost`, `createWidget`, `getWidget`, `listActiveWidgets` (MemoryCustomersStore by default)

## Out of scope here

- Live DNS TXT calls (FR-200)
- Parts/Click HTTP handlers (FR-197 / FR-198 / FR-199)
- `POST /widgets` Lambda (FR-232)
- Creating the empty `a_search` / `a_search_sandbox` databases themselves (FR-251 infra)
