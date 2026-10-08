---
name: a-search-shopify
description: >
  Maintain a-search shopify local / MSSQL parts provider worker. Use in providers/local/shopify.
---

# a-search shopify (local)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry folder `providers/local/shopify`. Enabled: live=false, sandbox=false (stay dark until account details exist).

## Catalogue client (FR-101)

`src/catalog.js` - injectable Admin REST `GET /admin/api/{version}/products.json` with `X-Shopify-Access-Token`.
Recorded fixture: `fixtures/products-ok.json`. Pin tests: `tests/fr101-shopify-catalog.test.js`.
Out of scope for FR-101: MSSQL upsert, registry enable, multi-merchant router.

## Normalize + upsert (FR-102)

- `src/normalize.js` - Admin REST product to Parts staging columns (`Source`, `FeedKey`, `MerchantProductId`, `Env`, `Title`, ... + `ContentHash`).
- `src/upsert.js` - `upsertShopifyParts` / `shopifyUpsertPartsHook` wraps maintainer set-based MERGE; inject `clearStaging` / `bulkLoadStaging` / `runMerge` for deploy, or use in-memory `mergePartsSetBased` offline.
- Fixture: `fixtures/products-ok.json`. Pin: `tests/fr102-shopify-normalize-upsert.test.js`.
- Out of scope for FR-102: registry enable, live merchant tokens, worker query path (FR-103).

## Search path

SELECT dbo.Parts WHERE Source='shopify' (maintainer owns store sync / feeds).

## Worker + queryParts (FR-103)

`src/worker.js` + `src/queryParts.js`: injectable MSSQL `defaultQueryParts` -> normalize Parts -> `writeResults`.
Relative product Urls resolve against `SHOPIFY_STORE_URL`; tracked links stamp `SHOPIFY_AFFILIATE_ID` as `sid`.
Stay-dark; no "not wired" stub on the happy path.
Pin: `tests/fr103-shopify-worker.test.js`. Catalogue client (FR-101) and normalize/upsert (FR-102) are separate.

## Env

See `.env.example` (`MSSQL_*`, `SHOPIFY_STORE_URL`, `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_AFFILIATE_ID`, optional `SHOPIFY_API_VERSION`). Queue env: `SQS_SHOPIFY_URL`.
