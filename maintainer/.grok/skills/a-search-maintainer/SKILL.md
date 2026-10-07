---
name: a-search-maintainer
description: >
  Maintain the a-search scheduled parts maintainer: rolling feed keys from
  MSSQL, conditional download, staging MERGE/deletes, live vs sandbox.
  Use in maintainer/ CWD or /a-search-maintainer. Does not run POST /search.
---

# a-search maintainer (scheduled parts refresh)

> **CAST IRON:** Never commit MSSQL passwords or provider feed secrets.
> Maintainer holds **SQL + schedule knobs** only. Feed credentials stay in
> `providers/local/<id>/.env`.

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

You are working in **`maintainer/`** — keeps local-source Parts current
so `providers/local/*` search workers can SELECT at request time.

Canonical docs: `docs/parts-maintainer.md`, `docs/environments.md`,
`docs/skillbook-layout.md` (FR-046a harvest checklist).

## Responsibilities

| Owns | Does not own |
|------|----------------|
| EventBridge / cron schedule entry | `POST /search` / JWT |
| Roll next stale feed keys (`MAINTAINER_TOP`) | Live affiliate API search |
| Conditional download (ETag / Last-Modified / hash) | Provider `.env` secrets |
| Staging + set-based **MERGE** + scoped deletes | Writing S3 search results |

## Rolling schedule

1. Tick (default proposal: every 15 minutes via `MAINTAINER_INTERVAL_MINUTES`).
2. Query MSSQL control table for keys due: never checked, `NextCheck <= now`,
   or backoff expired — oldest first, limit **`MAINTAINER_TOP`**.
3. For each key: change assessment **before** full download.
4. Upsert + delete for that key only; bump `LastChecked` / `NextCheck` / hash.
5. Exit. Next tick continues the **roll** — no single run downloads the
   whole estate.

## Conditional download

Before full CSV/feed body:

1. HTTP conditional GET (`If-None-Match` / `If-Modified-Since`) → 304 skip
2. HEAD / tiny manifest compare
3. Publisher checksum / first-chunk hash when available
4. Only on change (or force) download to staging, then parse

Identical `ContentHash` after download → skip upsert/delete; bump
`LastChecked` only.

## Database MERGE playbook

1. Bulk-load staging (TVP / `SqlBulkCopy`-style).
2. Set-based **`MERGE`** (or `UPDATE`+`INSERT`) staging → Parts.
3. Update only changed columns; skip identical hashes.
4. **Deletes**: remove/soft-delete parts for this `FeedKey` absent from
   staging — **scoped to the key**, never global truncate.
5. Transactions per feed key; batch via `MAINTAINER_UPSERT_BATCH`.

## Env

See `.env.example`: `A_SEARCH_ENV`, MSSQL connection placeholders,
`MAINTAINER_TOP`, interval / batch knobs.

## Schedule handler (wired)

`src/schedule.js` `handler(event, context, deps?)`:

1. Read `A_SEARCH_ENV` / `MAINTAINER_TOP`
2. `roll()` — due `PartFeedKeys` (inject `queryPartFeedKeys`)
3. Per key: `fetchFeed()` (inject `httpGet` / `bumpLastChecked`)
4. On change: `parseFeedRows` → `upsertParts` → `deleteMissingParts`
   (inject `runMerge` / `runScopedDelete` / staging loaders)
5. Return `{ processed, upserted, skipped, results }` — never a stub message

Offline tests inject deps; deploy wires MSSQL + real HTTP.
## Failures (playbook)

| Symptom | Check |
|---------|--------|
| Same keys every tick | `NextCheck` not updated; stuck error backoff |
| Full estate download | `MAINTAINER_TOP` too high / roll query wrong |
| Lock timeouts | Row-by-row upsert — use staging MERGE |
| Cross-env leak | Wrong `A_SEARCH_ENV` SQL target |

## Tests

From repo root (Node >=20):

```bash
npm test
```

FR-010 pins: `tests/maintainer-scaffold.test.js` (paths + skill mentions
roll, conditional download, MERGE).
