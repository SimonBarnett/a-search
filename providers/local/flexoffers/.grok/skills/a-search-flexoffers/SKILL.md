---
name: a-search-flexoffers
description: >
  Maintain a-search flexoffers local / MSSQL parts provider worker. Use in providers/local/flexoffers.
---

# a-search flexoffers (local)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry folder `providers/local/flexoffers`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark -- see `docs/phase2-providers.md`).
`rateLimit`: maxConcurrency 1 / minIntervalMs 250 (FR-096).

## Search path (FR-095)

SELECT dbo.Parts WHERE Source='flexoffers' AND DeletedAt IS NULL (maintainer owns feeds).
`src/queryParts.js` -- `defaultQueryParts` / `mssqlConfigFromEnv` with injectable
`connect` (no live SQL). Stay-dark.

## Worker (FR-095)

`src/worker.js` exports `run(msg, deps)` / `handler` / `normalizePart`.
Reads Parts via queryParts, normalizes, `buildTrackedUrl` with `FLEXOFFERS_AFFILIATE_ID`
-> query param `foid`, then `writeResults`. Stay-dark; no "not wired" stub on the happy path.

## Selftest + pacing (FR-096)

`src/selftestProbe.js` -- MSSQL Parts reachability (injectable `connect`) or
`FLEXOFFERS_API_TOKEN` feed-ready; returns `{ ok, source, latencyMs, error? }`
for `/selftest`. Registry `rateLimit`: `maxConcurrency: 1`, `minIntervalMs: 250`
(stay-dark; do not flip `enabled`).

## Maintainer feed-parser (FR-097)

`src/parseFeed.js` -- `parseFlexoffersFeedRows(body, meta)` / `flexoffersParseFeedRowsHook`
for maintainer `deps.parseFeedRows`. Fixture CSV: `fixtures/products-ok.csv`.
Maps Flexoffers product CSV/JSON into Parts staging columns
(`MerchantProductId`, `Title`, `Url`, `Price`, ...). Stay-dark; no live network in unit tests.

Credential / locator placeholders (never commit real values):

- `FLEXOFFERS_FEED_URL` -- optional default feed locator (PartFeedKeys.FeedUrl wins)
- `FLEXOFFERS_API_KEY` or `FLEXOFFERS_FEED_TOKEN` -- feed fetch auth
- `FLEXOFFERS_PUBLISHER_ID` -- account / programme id when required

`assertFlexoffersFeedCreds(env)` throws `flexoffers_missing_feed_credentials` when the API key is absent.

## Env

See `.env.example`. Queue env: `SQS_FLEXOFFERS_URL`. Placeholders only:
`MSSQL_*`, `FLEXOFFERS_AFFILIATE_ID=`.
Selftest placeholder: `FLEXOFFERS_API_TOKEN=`.
Feed placeholders: `FLEXOFFERS_FEED_URL=`, `FLEXOFFERS_API_KEY=`, `FLEXOFFERS_FEED_TOKEN=`,
`FLEXOFFERS_PUBLISHER_ID=`.
