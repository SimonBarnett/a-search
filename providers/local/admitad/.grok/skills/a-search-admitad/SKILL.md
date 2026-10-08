---
name: a-search-admitad
description: >
  Maintain a-search admitad local / MSSQL parts provider worker. Use in providers/local/admitad.
---

# a-search admitad (local)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry folder `providers/local/admitad`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark -- see `docs/phase2-providers.md`).
`rateLimit`: maxConcurrency 1 / minIntervalMs 250 (FR-093).

## Search path (FR-092)

SELECT dbo.Parts WHERE Source='admitad' AND DeletedAt IS NULL (maintainer owns feeds).
`src/queryParts.js` -- `defaultQueryParts` / `mssqlConfigFromEnv` with injectable
`connect` (no live SQL). Stay-dark.

## Worker (FR-092)

`src/worker.js` exports `run(msg, deps)` / `handler` / `normalizePart`.
Reads Parts via queryParts, normalizes, `buildTrackedUrl` with `ADMITAD_WEBSITE_ID`
-> query param `tag`, then `writeResults`. Stay-dark; no "not wired" stub on the happy path.

## Selftest + pacing (FR-093)

`src/selftestProbe.js` -- MSSQL Parts reachability (injectable `connect`) or
`ADMITAD_API_TOKEN` feed-ready; returns `{ ok, source, latencyMs, error? }`
for `/selftest`. Registry `rateLimit`: `maxConcurrency: 1`, `minIntervalMs: 250`
(stay-dark; do not flip `enabled`).

## Maintainer feed-parser (FR-094)

`src/parseFeed.js` -- `parseAdmitadFeedRows(body, meta)` / `admitadParseFeedRowsHook`
for maintainer `deps.parseFeedRows`. Fixture CSV: `fixtures/products-ok.csv`.
Maps Admitad product CSV/JSON into Parts staging columns
(`MerchantProductId`, `Title`, `Url`, `Price`, ...). Stay-dark; no live network in unit tests.

Credential / locator placeholders (never commit real values):

- `ADMITAD_FEED_URL` -- optional default feed locator (PartFeedKeys.FeedUrl wins)
- `ADMITAD_API_KEY` or `ADMITAD_FEED_TOKEN` -- feed fetch auth
- `ADMITAD_PUBLISHER_ID` -- account / programme id when required

`assertAdmitadFeedCreds(env)` throws `admitad_missing_feed_credentials` when the API key is absent.

## Env

See `.env.example`. Queue env: `SQS_ADMITAD_URL`. Placeholders only:
`MSSQL_*`, `ADMITAD_WEBSITE_ID=`.
Selftest placeholder: `ADMITAD_API_TOKEN=`.
Feed placeholders: `ADMITAD_FEED_URL=`, `ADMITAD_API_KEY=`, `ADMITAD_FEED_TOKEN=`,
`ADMITAD_PUBLISHER_ID=`.
