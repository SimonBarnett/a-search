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

## Catalogue client (FR-109)

`src/catalog.js` -- injectable WooCommerce REST `GET /wp-json/wc/v3/products` with Basic auth (`WOOCOMMERCE_CONSUMER_KEY` / `WOOCOMMERCE_CONSUMER_SECRET`).
Recorded fixture: `fixtures/products-ok.json`. Pin: `tests/fr109-woocommerce-catalog.test.js`.
Out of scope for FR-109: MSSQL upsert, registry enable, multi-merchant router.

## Search path

SELECT dbo.Parts WHERE Source='woocommerce' (maintainer owns store sync / feeds).

## Worker stub

`src/worker.js` exports `run(msg)` (FR-607).

## Env

See `.env.example` (`WOOCOMMERCE_STORE_URL`, `WOOCOMMERCE_CONSUMER_KEY`, `WOOCOMMERCE_CONSUMER_SECRET`). Queue env: `SQS_WOOCOMMERCE_URL`.
