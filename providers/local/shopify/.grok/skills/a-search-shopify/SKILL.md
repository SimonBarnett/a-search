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

## Search path

SELECT dbo.Parts WHERE Source='shopify' (maintainer owns store sync / feeds).

## Worker (FR-103)

`src/worker.js` + `src/queryParts.js`: injectable MSSQL `defaultQueryParts` → normalize Parts → `writeResults`.
Relative product Urls resolve against `SHOPIFY_STORE_URL`; tracked links stamp `SHOPIFY_AFFILIATE_ID` as `sid`.
Pin: `tests/fr103-shopify-worker.test.js`. Catalogue client (FR-101) and normalize/upsert (FR-102) are separate.

## Env

See `.env.example` (`MSSQL_*`, `SHOPIFY_STORE_URL`, `SHOPIFY_AFFILIATE_ID`). Queue env: `SQS_SHOPIFY_URL`.
