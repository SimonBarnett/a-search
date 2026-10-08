---
name: a-search-tradedoubler
description: >
  Maintain a-search tradedoubler local / MSSQL parts provider worker. Use in providers/local/tradedoubler.
---

# a-search tradedoubler (local)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry folder `providers/local/tradedoubler`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark -- see `docs/phase2-providers.md`).

## Search path (FR-089)

`src/queryParts.js` -- parameterized `SELECT` from `dbo.Parts` where
`Source='tradedoubler'` and `DeletedAt IS NULL`. Injectable `connect` for unit tests
(no live SQL). Stay-dark.

## Worker (FR-089)

`src/worker.js` `run(msg, deps)` -- `assertWorkerEnv` -> `defaultQueryParts` ->
`normalizePart` (+ `buildTrackedUrl` with `TRADEDOUBLER_AFFILIATE_ID` /
`tduid`) -> `writeResults`. Optional `handler` for SQS Records.
Stay-dark; no "not wired" stub on the happy path.

## Maintainer feed-parser (FR-091)

`src/parseFeed.js` -- `parseTradedoublerFeedRows(body, meta)` / `tradedoublerParseFeedRowsHook`
for maintainer `deps.parseFeedRows`. Fixture CSV: `fixtures/products-ok.csv`.
Maps Tradedoubler product CSV/JSON into Parts staging columns
(`MerchantProductId`, `Title`, `Url`, `Price`, ...). Stay-dark; no live network in unit tests.

Credential / locator placeholders (never commit real values):

- `TRADEDOUBLER_FEED_URL` -- optional default feed locator (PartFeedKeys.FeedUrl wins)
- `TRADEDOUBLER_API_KEY` or `TRADEDOUBLER_FEED_TOKEN` -- feed fetch auth
- `TRADEDOUBLER_PUBLISHER_ID` -- account / programme id when required

`assertTradedoublerFeedCreds(env)` throws `tradedoubler_missing_feed_credentials` when the API key is absent.

## Env

See `.env.example`. Queue env: `SQS_TRADEDOUBLER_URL`.
MSSQL: `MSSQL_SERVER`, `MSSQL_DATABASE`, `MSSQL_USER` / `MSSQL_PASSWORD`
(or `MSSQL_TRUSTED_CONNECTION`). Account: `TRADEDOUBLER_AFFILIATE_ID`.
