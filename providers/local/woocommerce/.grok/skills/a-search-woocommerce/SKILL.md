---
name: a-search-woocommerce
description: >
  Maintain a-search woocommerce local / MSSQL parts provider worker. Use in providers/local/woocommerce.
---

# a-search woocommerce (local)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry folder `providers/local/woocommerce`. Enabled: live=false, sandbox=false.

## Search path

SELECT dbo.Parts WHERE Source='woocommerce' (maintainer owns store sync / feeds).

## Worker (FR-111)

`src/worker.js` + `src/queryParts.js`: injectable MSSQL `defaultQueryParts` -> normalize Parts -> `writeResults`.
Relative product Urls resolve against `WOOCOMMERCE_STORE_URL`; tracked links stamp `WOOCOMMERCE_AFFILIATE_ID` as `sid`.
Pin: `tests/fr111-woocommerce-worker.test.js`. Catalogue (FR-109) and normalize/upsert (FR-110) are separate.

## Selftest + pacing (FR-112)

`src/selftestProbe.js` -- MSSQL Parts reachability (injectable `connect`) or
`WOOCOMMERCE_CONSUMER_KEY` feed-ready; returns `{ ok, source, latencyMs, error? }`
for `/selftest`. Registry `rateLimit`: `maxConcurrency: 1`, `minIntervalMs: 250`
(stay-dark; do not flip `enabled`). Pin: `tests/fr112-woocommerce-selftest-probe.test.js`.

## Env

See `.env.example` (`MSSQL_*`, `WOOCOMMERCE_STORE_URL`, `WOOCOMMERCE_AFFILIATE_ID`, `WOOCOMMERCE_CONSUMER_KEY`). Queue env: `SQS_WOOCOMMERCE_URL`.
