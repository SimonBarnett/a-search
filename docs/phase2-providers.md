# Phase-2 provider completion (FR-061)

**CAST IRON stay-dark rule:** implement every remaining stub provider with
fixture-backed clients while `providers/registry.json` keeps
`enabled.live=false` and `enabled.sandbox=false` until real account details
exist. Fan-out must not enqueue a Phase-2 id on default live or sandbox until
an operator flips the flag after credentials land.

Phase 2 turns FR-022 / FR-607 stubs into real clients (mirror amazon / ebay /
cj / awin under `providers/`). Unit tests use recorded fixtures only — no live
network. Never commit secrets; `.env.example` placeholders only.

## Phase-2 stub ids (stay dark)

These registry ids remain **disabled** for both envs until account details
exist. Completing a client + fixtures does **not** enable the source.

| id | kind | folder |
|----|------|--------|
| `kelkoo` | live | `providers/live/kelkoo` |
| `skimlinks` | live | `providers/live/skimlinks` |
| `aliexpress` | live | `providers/live/aliexpress` |
| `etsy` | live | `providers/live/etsy` |
| `bol` | live | `providers/live/bol` |
| `partnerize` | local | `providers/local/partnerize` |
| `webgains` | local | `providers/local/webgains` |
| `tradedoubler` | local | `providers/local/tradedoubler` |
| `admitad` | local | `providers/local/admitad` |
| `flexoffers` | local | `providers/local/flexoffers` |
| `avantlink` | local | `providers/local/avantlink` |
| `shopify` | local | `providers/local/shopify` |
| `wix` | local | `providers/local/wix` |
| `woocommerce` | local | `providers/local/woocommerce` |

## Already enabled (out of Phase-2 stay-dark)

`amazon`, `ebay`, `rakuten`, `cj`, `awin`, `impact` ship with
`enabled.live/sandbox=true` from Phase 1. Do not flip them false as part of
Phase-2 docs work.

## When to enable

1. Credentials and programme/merchant access exist for that id.
2. Fixture-backed client + worker path pass `node --test` without live calls.
3. Operator sets `enabled.live` / `enabled.sandbox` in `providers/registry.json`
   (per env). Code must never auto-enable on deploy.

## Related

- Shortlist + defaults: `docs/provider-shortlist.md`
- Add a source checklist: `docs/add-source.md`
- Registry loader: `providers/loadRegistry.js` → `enabled(env)`
