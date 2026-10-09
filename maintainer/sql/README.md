# Maintainer SQL migrations (FR-011 / FR-120)

**FR-120:** these objects are **a-search-owned**. They do not exist on
live `madeiradb` until ops apply the scripts below. Local search workers
(`providers/local/awin|impact`) SELECT `dbo.Parts` — they do **not** read
`dbo.MerchantProducts`. a-search **runtime never runs these scripts**
(no DDL from Lambda).

Idempotent T-SQL for MSSQL. Apply **once per database**: live `madeiradb`
and the separate sandbox database on the same instance (FR-121 LOCKED).
Do **not** use one shared DB with `Env` alone for live/sandbox isolation.
Rows still carry `Env` (`live`|`sandbox`) inside each DB for a-search DDL checks.

**Ops runbook (FR-146):** create the sandbox DB (recommended name
`a_search_sandbox`) and apply these scripts to both databases —
[`docs/sql/apply-ddl-runbook.md`](../../docs/sql/apply-ddl-runbook.md).

## Migrate-once

```text
sqlcmd -S <server> -d <database> -E -i 001_PartFeedKeys.sql
sqlcmd -S <server> -d <database> -E -i 002_Parts.sql
sqlcmd -S <server> -d <database> -E -i 003_PartsStaging.sql
```

Each script uses `IF NOT EXISTS` / `IF OBJECT_ID(...) IS NULL` so re-runs
are safe (no drop). Do **not** auto-run from Lambda on every tick —
ops apply these at deploy.

## Objects

| Object | Purpose |
|--------|---------|
| `PartFeedKeys` | Control table: roll order, ETag/hash, NextCheck |
| `Parts` | Current merchant parts for local search |
| `PartsStaging` | Per-run bulk load before MERGE |

Natural key on `Parts` / `PartsStaging`:
`(Source, FeedKey, MerchantProductId, Env)`.

`Env` is `live` or `sandbox` (matches `A_SEARCH_ENV`).
