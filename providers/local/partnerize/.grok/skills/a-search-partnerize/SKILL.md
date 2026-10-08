---
name: a-search-partnerize
description: >
  Maintain a-search partnerize local / MSSQL parts provider worker. Use in providers/local/partnerize.
---

# a-search partnerize (local)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry folder `providers/local/partnerize`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark -- see `docs/phase2-providers.md`).

## Search path

SELECT dbo.Parts WHERE Source='partnerize' (maintainer owns feeds).

## Worker stub

`src/worker.js` exports `run(msg)` (queryParts + writeResults is FR-083).

## Maintainer feed-parser (FR-085)

`src/parseFeed.js` -- `parsePartnerizeFeedRows(body, meta)` / `partnerizeParseFeedRowsHook`
for maintainer `deps.parseFeedRows`. Fixture CSV: `fixtures/products-ok.csv`.
Maps Partnerize product CSV/JSON into Parts staging columns
(`MerchantProductId`, `Title`, `Url`, `Price`, ...). Stay-dark; no live network in unit tests.

Credential / locator placeholders (never commit real values):

- `PARTNERIZE_FEED_URL` -- optional default feed locator (PartFeedKeys.FeedUrl wins)
- `PARTNERIZE_API_KEY` or `PARTNERIZE_FEED_TOKEN` -- feed fetch auth
- `PARTNERIZE_PUBLISHER_ID` -- account / programme id when required

`assertPartnerizeFeedCreds(env)` throws `partnerize_missing_feed_credentials` when the API key is absent.

## Selftest + pacing (FR-084)

`src/selftestProbe.js` -- MSSQL Parts reachability (injectable `connect`) or
`PARTNERIZE_API_TOKEN` feed-ready; returns `{ ok, source, latencyMs, error? }`
for `/selftest`. Registry `rateLimit`: `maxConcurrency: 1`, `minIntervalMs: 250`
(stay-dark; do not flip `enabled`).

## Env

See `.env.example`. Queue env: `SQS_PARTNERIZE_URL`.
