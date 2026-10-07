---
name: a-search-ebay
description: >
  Maintain the a-search eBay live provider worker: SQS consume, Browse API
  search, normalize products, S3 results write, live vs sandbox. Use in
  providers/live/ebay or /a-search-ebay. Holds eBay secrets only here.
---

# a-search eBay (live provider)

> **CAST IRON:** Never commit eBay client secrets or refresh tokens.
> Keep them in `providers/live/ebay/.env` only.

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry id `ebay` (`kind: live`, default-on).

## Responsibilities

| Owns | Does not own |
|------|----------------|
| SQS consume for eBay queue | `POST /search` / JWT |
| eBay Browse API client | MSSQL maintainer |
| Normalize → products[] | Other providers' secrets |
| S3 results at canonical key | Registry / fan-out |

## Worker (FR-039)

`src/worker.js` exports `run(msg, deps?)`:

1. `assertWorkerEnv` — `message.env` must equal `A_SEARCH_ENV`
2. Require `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` (optional `EBAY_REFRESH_TOKEN`)
3. OAuth access token → Browse `item_summary/search` (`src/search.js`); injectable `httpRequest` / `accessToken` for fixtures
4. Normalize itemSummaries (`src/normalize.js`) → `products[]`
5. `writeResults` → `S3_RESULTS_BUCKET` at `{env}/ebay/{userId}/{catalogId}/{searchId}.json`

## Sandbox vs live

| | Sandbox | Live |
|-|---------|------|
| `A_SEARCH_ENV` | `sandbox` | `live` |
| `EBAY_ENV` | `sandbox` → `api.sandbox.ebay.com` | `production` / `live` → `api.ebay.com` |
| Marketplace | `EBAY_MARKETPLACE_ID` (default `EBAY_GB`) | same key, production marketplace |
| Queues | sandbox SQS URL only | live SQS URL only |

Onboarding (keys obtain): `.grok/skills/a-search-ebay-onboarding/SKILL.md`.

## Env

See `.env.example`: `A_SEARCH_ENV`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`,
`EBAY_REFRESH_TOKEN`, `EBAY_MARKETPLACE_ID`, `EBAY_ENV`, `SQS_EBAY_URL`,
`S3_RESULTS_BUCKET`.

Missing client id/secret → `EbayCredsError` / `ebay_missing_credentials`.

## Failures

| Symptom | Check |
|---------|--------|
| 401 | OAuth token expired / client id |
| 429 | Backoff |
| env_mismatch | `message.env` !== `A_SEARCH_ENV` |

Recorded fixture: `fixtures/item-summary-ok.json` (`tests/ebay-search.test.js`).

## Tests

```bash
npm test
```

- FR-017: `tests/ebay-scaffold.test.js`
- FR-039: `tests/ebay-search.test.js`
