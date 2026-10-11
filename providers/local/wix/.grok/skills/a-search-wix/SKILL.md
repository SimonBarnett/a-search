---
name: a-search-wix
description: >
  Maintain a-search wix local / MSSQL parts provider worker. Use in providers/local/wix.
---

# a-search wix (local)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry folder `providers/local/wix`. Enabled: live=true, sandbox=true (FR-179 merchant; `class: merchant`).
`rateLimit`: maxConcurrency 1 / minIntervalMs 250 (FR-108).

## Catalogue client (FR-105)

`src/catalog.js` - injectable `POST /stores/v1/products/query` with `Authorization` + `wix-site-id`.
Recorded fixture: `fixtures/products-ok.json`. Pin: `tests/fr105-wix-catalog.test.js`.
Out of scope for FR-105: MSSQL upsert, registry enable, multi-merchant router.

## Normalize + upsert (FR-106)

- `src/normalize.js` - Stores product to Parts staging columns (+ ContentHash).
- `src/upsert.js` - `upsertWixParts` / `wixUpsertPartsHook` wraps maintainer set-based MERGE; inject clear/bulkLoad/runMerge for deploy.
- Fixture: `fixtures/products-ok.json`. Pin: `tests/fr106-wix-normalize-upsert.test.js`.
- Out of scope: registry enable, live merchant tokens, worker query path (FR-107).

## Search path

SELECT dbo.Parts WHERE Source='wix' (maintainer owns store sync / feeds).

## Worker + queryParts (FR-107)

`src/worker.js` + `src/queryParts.js`: injectable MSSQL `defaultQueryParts` -> normalize Parts -> `writeResults`.
Relative product Urls resolve against `WIX_STORE_URL` as plain absolute http(s) (merchant; no affiliate `sid`).
Enabled both envs; no "not wired" stub on the happy path.
Pin: `tests/fr107-wix-worker.test.js`. Catalogue (FR-105) and normalize/upsert (FR-106) are separate.

## Selftest + pacing (FR-108)

`src/selftestProbe.js` -- MSSQL Parts reachability (injectable `connect`) or
`WIX_API_TOKEN` feed-ready; returns `{ ok, source, latencyMs, error? }`
for `/selftest`. Registry `rateLimit`: `maxConcurrency: 1`, `minIntervalMs: 250`
(enabled FR-179). Pin: `tests/fr108-wix-selftest-probe.test.js`.

## Env

See `.env.example` (`MSSQL_*`, `WIX_SITE_ID`, `WIX_API_TOKEN`, `WIX_CLIENT_ID`, `WIX_STORE_URL`, optional `WIX_API_BASE`). Queue env: `SQS_WIX_URL`. No `WIX_AFFILIATE_ID`.
