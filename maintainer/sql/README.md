# Maintainer SQL migrations (FR-011)

Idempotent T-SQL for MSSQL. Apply **once per database** (live DB and
sandbox DB separately, or one DB with `Env` discriminating rows).

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
