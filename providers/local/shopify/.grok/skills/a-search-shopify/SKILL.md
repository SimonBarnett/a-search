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

`src/catalog.js` — injectable Admin REST `GET /admin/api/{version}/products.json` with `X-Shopify-Access-Token`.
Recorded fixture: `fixtures/products-ok.json`. Pin tests: `tests/fr101-shopify-catalog.test.js`.
Out of scope for FR-101: MSSQL upsert, registry enable, multi-merchant router.

## Search path

SELECT dbo.Parts WHERE Source='shopify' (maintainer owns store sync / feeds).

## Worker stub

`src/worker.js` exports `run(msg)` (FR-607). Still a stub; catalogue sync is separate.

## Env

See `.env.example` (`SHOPIFY_STORE_URL`, `SHOPIFY_ACCESS_TOKEN`, optional `SHOPIFY_API_VERSION`). Queue env: `SQS_SHOPIFY_URL`.
