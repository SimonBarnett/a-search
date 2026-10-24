---
name: a-search-amazon
description: >
  Maintain the a-search Amazon live provider worker: SQS consume, PA-API
  SearchItems, normalize products, S3 results write, live vs sandbox. Use in
  providers/live/amazon or /a-search-amazon. Holds Amazon secrets only here.
---

# a-search Amazon (live provider)

> **CAST IRON:** Never commit PA-API access/secret keys or partner tags.
> Keep them in `providers/live/amazon/.env` only.

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

You are working in **`providers/live/amazon/`** - offline worker for
registry id `amazon` (`kind: live`, default-on).

## API choice (FR-045 + FR-181 + FR #4562)

LOCKED (Phase 1): Amazon live search uses PA-API SearchItems (shipped in
FR-030). Associates Creators API is a follow-up FR (implemented FR-182/183).

Decision (LOCKED) / FR-181 coexistence: Creators API runs **behind a feature flag**.
**PA-API SearchItems remains** available via explicit `AMAZON_SEARCH_API=paapi`.
**FR #4562** sets the deploy default to Creators (`AMAZON_SEARCH_API=creators`)
because PA-API 5 returns HTML 503s in production. Non-JSON Amazon faults
fail into the Amazon DLQ with a CloudWatch log (FR #4769; no status IN).

See [docs/provider-shortlist.md](../../../../../docs/provider-shortlist.md) and
[docs/fr/FR-181.md](../../../../../docs/fr/FR-181.md).

## Responsibilities

| Owns | Does not own |
|------|----------------|
| SQS consume for Amazon queue | `POST /search` / JWT |
| Amazon PA-API SearchItems client | MSSQL parts maintainer |
| Normalize - products[] | Other providers' credentials |
| S3 results write at canonical key | Fan-out / registry edits |

## Worker (FR-030)

`src/worker.js` exports `run(msg, deps?)`:

1. `assertWorkerEnv` - `message.env` must equal `A_SEARCH_ENV`
2. Creators path (default, FR #4562 / #4721): `AMAZON_ACCESS_KEY` +
   `AMAZON_SECRET_KEY` + `AMAZON_PARTNER_TAG` (LwA client_credentials ->
   `creatorsapi.amazon/catalog/v1/searchItems`). Optional
   `AMAZON_CREATORS_CREDENTIAL` bearer override for fixtures. PA-API path
   (`AMAZON_SEARCH_API=paapi`): same access/secret/partnerTag keys
3. Search HTTP (`src/search.js` or `src/creatorsSearch.js`); injectable `httpRequest`
   - FR-182/183 / #4562: Creators default on; explicit `paapi` keeps PA-API
   - FR #4807 madeira parity: Creators `searchItems` then `getItems` for ASINs
     missing offer price; `displayAmount` parse; ASIN `/dp/` URL when
     `detailPageURL` absent (same LwA creds as madeira `paapi.js`)
   - FR #4816: live Creators call matches madeira `paapi.js` -- UK token URL and
     `www.amazon.co.uk` (not derived from `AMAZON_HOST`/`AMAZON_REGION`); always
     mint LwA from access/secret (env `AMAZON_CREATORS_CREDENTIAL` ignored);
     `PAAPI_MAX_PAGES` paging, 429 back-off, 401 token-cache clear
   - Permanent vendor faults (`paapi_non_json` / `creators_non_json` /
     `creators_not_eligible` AssociateNotEligible): fail into DLQ, no status IN
     / no intake (FR #4769 supersedes #4562 / #4739 status-IN path)
4. Normalize items (`src/normalize.js` / Creators normalize in `creatorsSearch.js`) - `products[]`
5. `writeLiveProviderInResult` - a-clubs `IN/{searchid}-amazon.json`

Message shape: `searchId`, `userId`, `env`, `q` / `searchterms`, `catalogId`,
`category`, `subcategory`, `source`.

## SQS Lambda handler (FR-038)

`src/handler.js` is the SQS entry: for each `event.Records[]`, `JSON.parse(body)` -
`run(msg)`. Bad JSON or `run` errors **throw** so Lambda/SQS can retry.
`assertWorkerEnv` inside `run` rejects wrong-env messages (`EnvIsolationError`).

CDK wires `handler=worker.handler` (FR-036); `worker.js` re-exports `handler` from
`handler.js`. Do not ship a worker with only `run` and no Lambda entrypoint.

Tests: `tests/amazon-handler.test.js`.

## Auth / credentials

| Env | Purpose |
|-----|---------|
| `AMAZON_ACCESS_KEY` | PA-API key id + Creators LwA `client_id` (FR #4721) |
| `AMAZON_SECRET_KEY` | PA-API secret + Creators LwA `client_secret` |
| `AMAZON_PARTNER_TAG` | Associates partner tag |
| `AMAZON_HOST` | default `webservices.amazon.co.uk` |
| `AMAZON_REGION` | default `eu-west-1` (selects EU vs NA token URL) |
| `AMAZON_CREATORS_CREDENTIAL` | optional bearer override (fixtures / SSM) |
| `AMAZON_CREATORS_ENDPOINT` | default `https://creatorsapi.amazon/catalog/v1/searchItems` |
| `S3_RESULTS_BUCKET` | results PutObject |
| `A_SEARCH_ENV` | `live` \| `sandbox` |

Missing Amazon creds - `AmazonCredsError` / `amazon_missing_credentials` with
the missing variable names (no HTTP call). Prefer **sandbox** host/tag for
soak; never log secret values.

## Rate limits

| Symptom | Action |
|---------|--------|
| HTTP **429** / ThrottlingException | Exponential backoff; do **not** tight-loop the queue |
| Burst of empty results | Check Keywords; still write JSON (`products: []`) |
| 401/403 | Keys, partner tag, marketplace/host mismatch |

Recorded fixture: `fixtures/search-items-ok.json` (used by
`tests/amazon-search.test.js` via injectable `httpRequest`).

## Tests

```bash
npm test
```

- FR-016: `tests/amazon-scaffold.test.js`
- FR-030: `tests/amazon-search.test.js` (fixture - S3 put; missing creds error)
- FR-038: `tests/amazon-handler.test.js` (SQS record - run; bad JSON; wrong-env)

## Result schema (FR-042)

Normalize via `worker/lib/normalizeProduct.js`; see [docs/result-schema.md](../../../../../docs/result-schema.md).
