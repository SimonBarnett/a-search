# Phase-3: enable one provider (ritual template)

**FR-126** - docs + pin only. This document is the **template** for later
per-id enable FRs. It does **not** enable any provider. Phase-2 stay-dark ids
in `providers/registry.json` must remain `enabled.live=false` and
`enabled.sandbox=false` on the FR-126 tip.

CAST IRON: never auto-enable on deploy; never bulk-flip every Phase-2 id in one
PR; never commit secrets.

## Goal

Enable **exactly one** registry `id` for the env(s) that have credentials and a
green selftest, while every other stay-dark id stays dark. Pin that contract in
the enable FR's tests.

## Ritual (one id)

1. **Credentials in the secret store** (Secrets Manager / deploy context - not
   git). `.env.example` placeholders only. Confirm the provider skillbook
   obtain steps in `providers/.../.grok/skills/a-search-<id>/SKILL.md`.
2. **Fixture / client green** - `node --test` for that provider's unit pins
   without live network (Phase-2 stay-dark work already landed clients).
3. **Selftest green** for that id on the target env
   (`docs/endpoint-selftest.md`). Do not flip `enabled` while selftest fails.
4. **Flip only that id** in `providers/registry.json`:
   set `enabled.live` and/or `enabled.sandbox` for **this id only**.
5. **Pin stay-others-dark** - the enable FR's test lists the other Phase-2
   stub ids and asserts they remain `enabled.*.false`. Reuse the id list from
   `tests/fr061-phase2-providers-docs.test.js` / `tests/fr126-phase3-enable-provider-docs.test.js`
   (drop the id being enabled).
6. **Open one enable FR per id** (Phase-4 wave: #1011 index + #1013-#1027).
   Do not combine multiple ids in one enable PR. Index + credential-gate
   checklist: [phase4-enablement-index.md](phase4-enablement-index.md) (**FR-166**).

## Extra gates for **local** providers (`kind: local`)

Operator evidence on #955 (madeiradb, read-only): Awin/Impact selftest probes
query `dbo.Parts`. Until maintainer DDL `001-003` is applied and Parts rows
exist for that `Source`/`Env`, selftest returns `missing_table` / empty.

Enable order for any **local** id:

1. DDL applied on the SQL instance (`maintainer/sql/`).
2. Maintainer has loaded `Parts` rows for that `Source` / `Env`.
3. Least-privilege SQL login exists (FR-122 / network path; related #951).
4. Selftest green for that id.
5. Flip `enabled` for that id only.

Some Phase-2 local sources have **no** legacy rows in madeiradb today (Impact
and others). After DDL they still start from an empty `Parts` until feeds
land - enable only when ingest + selftest are ready.

## Already enabled (do not flip false here)

Phase-1 ids stay on: `amazon`, `ebay`, `rakuten`, `cj`, `awin`, `impact`
(`enabled.live/sandbox=true`). **FR-167** `kelkoo`, **FR-168** `skimlinks`, **FR-169** `aliexpress`, **FR-170** `etsy` enabled.
This template is for remaining stay-dark -> enable moves.
This template is for remaining stay-dark -> enable moves.

## Phase-2 stay-dark ids (template pin)

| id | kind |
|----|------|
| `bol` | live |
| `partnerize` | local |
| `webgains` | local |
| `tradedoubler` | local |
| `admitad` | local |
| `flexoffers` | local |
| `avantlink` | local |
| `shopify` | local |
| `wix` | local |
| `woocommerce` | local |

## Related

- Stay-dark rule: [`docs/phase2-providers.md`](phase2-providers.md) (FR-061)
- Phase-4 index: [`docs/phase4-enablement-index.md`](phase4-enablement-index.md) (FR-166)
- Shortlist defaults: [`docs/provider-shortlist.md`](provider-shortlist.md)
- Add-source checklist: [`docs/add-source.md`](add-source.md)
- Selftest: [`docs/endpoint-selftest.md`](endpoint-selftest.md)
- Registry loader: `providers/loadRegistry.js` -> `enabled(env)`
- Pin: `tests/fr126-phase3-enable-provider-docs.test.js`
