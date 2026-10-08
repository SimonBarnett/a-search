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

## Normalize + upsert (FR-110)

- `src/normalize.js` -- WooCommerce REST product -> Parts staging columns (`Source`, `FeedKey`, `MerchantProductId`, `Env`, `Title`, ... + `ContentHash`).
- `src/upsert.js` -- `upsertWooCommerceParts` / `woocommerceUpsertPartsHook` wraps maintainer set-based MERGE; inject `clearStaging` / `bulkLoadStaging` / `runMerge` for deploy, or use in-memory `mergePartsSetBased` offline.
- Fixture: `fixtures/products-ok.json`. Pin: `tests/fr110-woocommerce-normalize-upsert.test.js`.
- Out of scope for FR-110: registry enable, live merchant tokens, worker query path (FR-111).

## Search path

SELECT dbo.Parts WHERE Source='woocommerce' (maintainer owns store sync / feeds).

## Worker stub

`src/worker.js` exports `run(msg)` (FR-607).

## Env

See `.env.example`. Queue env: `SQS_WOOCOMMERCE_URL`.
