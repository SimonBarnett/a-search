# Phase-2 provider completion (FR-061)

**CAST IRON stay-dark rule:** implement every remaining stub provider with
fixture-backed clients while `providers/registry.json` keeps
`enabled.live=false` and `enabled.sandbox=false` until real account details
exist. Fan-out must not enqueue a Phase-2 id on default live or sandbox until
an operator flips the flag after credentials land.

Phase 2 turns FR-022 / FR-607 stubs into real clients (mirror amazon / ebay /
cj / awin under `providers/`). Unit tests use recorded fixtures only - no live
network. Never commit secrets; `.env.example` placeholders only.

## Phase-2 stub ids (stay dark)

These registry ids remain **disabled** for both envs until account details
exist. Completing a client + fixtures does **not** enable the source.

| id | kind | folder |
|----|------|--------|
| `kelkoo` | live | `providers/live/kelkoo` |
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
`enabled.live/sandbox=true` from Phase 1. **`skimlinks`** was enabled by
FR-168 (#1015) and **`aliexpress`** by FR-169 (#1016) for both envs. Do not flip enabled ids false as part of
Phase-2 docs work.

## When to enable

Follow the Phase-3 one-provider ritual in
[`docs/phase3-enable-provider.md`](phase3-enable-provider.md) (FR-126):

1. Credentials and programme/merchant access exist for that id (secret store,
   not git).
2. Fixture-backed client + worker path pass `node --test` without live calls.
3. Selftest green for that id (local ids: DDL + Parts + least-privilege first).
4. Operator sets `enabled.live` / `enabled.sandbox` in `providers/registry.json`
   for **that id only**. Code must never auto-enable on deploy.
5. Enable FR pin asserts other Phase-2 stub ids stay dark.

## Related

- Enable ritual template: `docs/phase3-enable-provider.md` (FR-126)
- Shortlist + defaults: `docs/provider-shortlist.md`
- Add a source checklist: `docs/add-source.md`
- Registry loader: `providers/loadRegistry.js` -> `enabled(env)`
