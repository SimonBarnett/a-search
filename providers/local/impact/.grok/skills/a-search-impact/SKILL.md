---
name: a-search-impact
description: >
  Maintain the a-search Impact local provider worker: SQS consume, SELECT
  MSSQL Parts for impact source, normalize products, S3 results write,
  live vs sandbox. Use in providers/local/impact or /a-search-impact.
  Feed ingest is maintainer; this skill covers search SQL.
---

# a-search Impact (local provider)

> **CAST IRON:** Never commit MSSQL passwords or Impact feed credentials.
> Keep them in `providers/local/impact/.env` only.

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

You are working in **`providers/local/impact/`** — offline worker for
registry id `impact` (`kind: local`, default-on).

## Responsibilities

| Owns | Does not own |
|------|----------------|
| SQS consume for Impact queue | `POST /search` / JWT |
| SELECT against `dbo.Parts` where Source=impact | Feed CSV download / MERGE |
| Normalize Parts rows → products[] | Other providers' credentials |
| S3 results write at canonical key | Fan-out / registry edits |

## Search vs ingest

```
maintainer (schedule) → MSSQL Parts
POST /search → SQS local/impact → worker SELECTs Parts → S3 results
```

Ingest is **`maintainer/`** (roll / fetch / upsert / scoped delete). This
worker only **reads** Parts for `Source = N'impact'` and `Env = message.env`,
skipping soft-deleted rows (`DeletedAt IS NULL`).

## Worker (FR-044)

`src/worker.js` exports `run(msg, deps?)`:

1. `assertWorkerEnv` — `message.env` must equal `A_SEARCH_ENV`
2. `defaultQueryParts` (`src/queryParts.js`) — parameterized SELECT on
   `dbo.Parts` (`Source=N'impact'`, `Env=@env`, `DeletedAt IS NULL`, Title /
   Description LIKE from `q` / `searchterms`). Injectable `deps.connect` /
   `deps.queryParts` for fixtures.
3. `normalizePart` — `MerchantProductId` → `id`, `Title` → `title`, etc.
4. `writeResults` — S3 at canonical key (injectable `putObject`)

Missing `MSSQL_SERVER` / `MSSQL_DATABASE` (and user unless trusted) →
`ImpactMssqlConfigError` (`impact_mssql_missing_config`) — never silent `[]`.

Message shape matches entry fan-out payload (`searchId`, `userId`, `env`,
`q` / `searchterms`, `catalogId`, `category`, `subcategory`, `source`).

## Env

See `.env.example`: `A_SEARCH_ENV`, MSSQL connection placeholders,
`SQS_IMPACT_URL`, `S3_RESULTS_BUCKET`.

## Failures (playbook)

| Symptom | Check |
|---------|--------|
| `impact_mssql_missing_config` | `MSSQL_SERVER` + `MSSQL_DATABASE` (+ user or trusted) |
| Login failed / timeout | MSSQL_SERVER / firewall / creds |
| Empty products | Query too narrow; Parts not ingested for FeedKey |
| env_mismatch | `message.env` !== `A_SEARCH_ENV` |
| Soft-deleted noise | Filter `DeletedAt IS NULL` |

## Tests

```bash
npm test
```

- FR-021: `tests/impact-scaffold.test.js`
- FR-044: `tests/impact-search.test.js` (mock connect → products + writeResults; missing config error; SQL pins)

## Harvested lessons (relocated from bobiverse, 2026-10-08)

Misfiled a-search harvests from SimonBarnett/bobiverse, moved here so no lesson is lost.
MRB: keep, reword or trim; twins are listed once with every source.

- FR-051a: Impact pending onboard when API UNKNOWN = docs/impact-pending-onboard-queue.md + docs/sql/001_ImpactPendingOnboard.sql env keys; durable a-search PR #447 (bobiverse#3235; context: FR-051a Impact pending-onboard queue docs+DDL; PR #447)
- FR-051b Impact runOnce pending drain: injectable listPending/markProcessed/countRemaining; durable a-search PR (see DONE url) (bobiverse#3236; context: FR-051b impact pending drain; PR opened)
- FR-051c Impact emitSignupRow Awin subset keys; durable a-search PR (see DONE) (bobiverse#3237; context: FR-051c impact emitSignupRow; PR opened)
