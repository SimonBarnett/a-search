---
name: a-search-webgains
description: >
  Maintain a-search webgains local / MSSQL parts provider worker. Use in providers/local/webgains.
---

# a-search webgains (local)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry folder `providers/local/webgains`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark -- see `docs/phase2-providers.md`).

## Search path (FR-086)

`src/queryParts.js` -- parameterized `SELECT` from `dbo.Parts` where
`Source='webgains'` and `DeletedAt IS NULL`. Injectable `connect` for unit tests
(no live SQL). Stay-dark.

## Worker (FR-086)

`src/worker.js` `run(msg, deps)` -- `assertWorkerEnv` -> `defaultQueryParts` ->
`normalizePart` (+ `buildTrackedUrl` with `WEBGAINS_CAMPAIGN_ID` /
`wgcampaignid`) -> `writeResults`. Optional `handler` for SQS Records.
Stay-dark; no "not wired" stub on the happy path.

## Maintainer feed-parser (FR-088)

`src/parseFeed.js` -- `parseWebgainsFeedRows(body, meta)` / `webgainsParseFeedRowsHook`
for maintainer `deps.parseFeedRows`. Fixture CSV: `fixtures/products-ok.csv`.
Maps Webgains product CSV/JSON into Parts staging columns
(`MerchantProductId`, `Title`, `Url`, `Price`, ...). Stay-dark; no live network in unit tests.

Credential / locator placeholders (never commit real values):

- `WEBGAINS_FEED_URL` -- optional default feed locator (PartFeedKeys.FeedUrl wins)
- `WEBGAINS_API_KEY` or `WEBGAINS_FEED_TOKEN` -- feed fetch auth
- `WEBGAINS_PUBLISHER_ID` -- account / programme id when required

`assertWebgainsFeedCreds(env)` throws `webgains_missing_feed_credentials` when the API key is absent.

## Env

See `.env.example`. Queue env: `SQS_WEBGAINS_URL`.
MSSQL: `MSSQL_SERVER`, `MSSQL_DATABASE`, `MSSQL_USER` / `MSSQL_PASSWORD`
(or `MSSQL_TRUSTED_CONNECTION`). Account: `WEBGAINS_CAMPAIGN_ID`.
