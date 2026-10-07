# Local parts maintainer (LOCKED)

Local search sources (Awin-class aggregators) do **not** hit remote APIs at
search time for the full catalogue. Parts live in **MSSQL**. A scheduled AWS
task keeps those parts current from CSV/feed downloads keyed by rows already
in the database.

Runs separately for **live** and **sandbox** (`A_SEARCH_ENV`), each against
that env’s SQL target and staging paths (see `docs/environments.md`). Staging
files may use the rclone-mapped tree under `{env}/_staging/...`.

## Folder

```
maintainer/                    # EventBridge → Lambda (or Fargate) schedule
  .env.example                 # MSSQL + S3 staging + schedule knobs only
  src/
    schedule.js                # entry for scheduled invoke
    roll.js                    # pick next stale feed keys from MSSQL
    fetch.js                   # conditional download (ETag / Last-Modified / hash)
    upsert.js                  # staging + set-based MERGE / TVP
    delete.js                  # remove/soft-delete parts absent from feed
  .grok/skills/a-search-maintainer/SKILL.md
  AGENTS.md
```

Per-aggregator feed parsers and credentials stay under
`providers/local/<id>/` (each with its own `.env` + skillbook). The
maintainer orchestrates; local provider folders own “how to talk to Awin /
Impact / … feeds”.

## Rolling schedule (sensible, not blind full-estate)

1. EventBridge cron (default proposal: every 15 minutes; env
   `MAINTAINER_INTERVAL_MINUTES`).
2. Query MSSQL for feed **keys** due for work, ordered oldest-first, limit
   `MAINTAINER_TOP` (default 5–20):
   - never checked
   - `NextCheck <= now`
   - stuck / error backoff expired
3. For each key, run change assessment **before** full download (see below).
4. Upsert + delete for that key only; set `LastChecked`, `NextCheck`,
   `ContentHash` / `ETag`.
5. Exit. Next tick continues the roll. No single run downloads every
   advertiser feed on the estate.

Keys live in a control table (name TBD; e.g. `PartFeedKeys`): advertiser /
feed id, source (`awin`, …), URL or feed locator, ETag, Last-Modified,
ContentHash, LastChecked, NextCheck, LastError.

## Change assessment (avoid blind download)

Before pulling a full CSV/feed body, attempt in order:

1. **HTTP conditional GET** — `If-None-Match` / `If-Modified-Since` when the
   publisher supports it → `304` means skip parse/upsert.
2. **HEAD or tiny manifest** — compare size / version / `Last-Modified` to
   stored metadata.
3. **Hash of first chunk or publisher checksum** when available.
4. Only on change (or forced refresh) download to staging (local temp or S3),
   then parse.

If the network offers no conditional headers, still compare a stored
`ContentHash` after download **before** opening a write transaction; identical
hash → skip upsert/delete and only bump `LastChecked`.

## Database-friendly upserts / deletes

Goals: minimal lock time, set-based operations, no row-by-row ORM chatter.

1. Load parsed rows into a **staging table** (bulk copy / TVP /
   `SqlBulkCopy`-style), keyed by `(Source, FeedKey, MerchantProductId)`.
2. Single set-based **`MERGE`** (or `UPDATE`…`FROM` + `INSERT` where not
   matched) from staging → `Parts` (or `MerchantProducts` equivalent).
3. Update only columns that can change (price, title, url, image, stock,
   hash); avoid rewriting unchanged rows when hashes match.
4. **Deletes**: `DELETE`/`UPDATE … SET DeletedAt` for parts of that
   `FeedKey` **not** present in staging for this successful refresh
   (scoped to the key — never global truncate).
5. Keep transactions per feed key, not per row; batch size env
   `MAINTAINER_UPSERT_BATCH`.
6. Indexes: supporting unique key on natural part id per source; avoid
   heap scans on merge join columns.

Local **search** workers (`providers/local/<id>/`) only **read** MSSQL FTS /
keyed queries; they do not download CSVs.

## Relation to search

```
maintainer (schedule) → MSSQL Parts
POST /search → SQS local/awin → worker SELECTs Parts → S3 results
```

## Skillbook

`maintainer/AGENTS.md` + `.grok/skills/a-search-maintainer/SKILL.md` must
document schedule knobs, control-table shape, upsert playbook, and how to
debug a stuck feed key without touching live provider search workers.
