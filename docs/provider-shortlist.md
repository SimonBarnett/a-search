# a-search - provider shortlist (this pass)

Every likely candidate ships as its **own folder + `.env` + SQS queue**, listed in
`providers/registry.json` with per-env **`enabled`** flags (`{ "live": bool, "sandbox": bool }`).
Entry fan-out only enqueues sources where `enabled[env]` is true. Operators flip
flags without code edits. Loader: `providers/loadRegistry.js` -> `enabled(env)`.

Kinds: **live** (remote search API on each SQS job) vs **local** (owned part
data / feed ingest - Awin-style).

Legacy reference: Amazon PA-API, eBay Browse, Awin-as-local (`MerchantProducts`).
ShareASale is **not** a candidate (merged into Awin; API gone Oct 2025).

## Amazon API choice (FR-045)

LOCKED (Phase 1): Amazon live search uses PA-API SearchItems (shipped in
FR-030 / `providers/live/amazon`). Associates Creators API remains a
**follow-up FR** when credentials/access are available (or if a human
explicitly re-scopes to Creators). Do not thrash PA-API vs Creators in
Phase 1 without that new FR. PA-API v5 retirement notes stay informational;
they do not unlock a silent client swap.


## Amazon Creators coexistence (FR-181)

Decision (LOCKED): Creators API runs **behind a feature flag** (default off).
**PA-API SearchItems remains** the live production path for `amazon`.
Creators does **not** replace PA-API. Sandbox may enable the flag for trials;
live stays PA-API until a later enable FR. Implementation: **FR-182+**
(client + fixtures, flagged off). See [docs/fr/FR-181.md](fr/FR-181.md).


## Market hold - GBP / UK (LOCKED 2026-10-14)

Target market: **UK shoppers / GBP catalogue** (Club Madeira / smartcatalogue.uk).

**Rule:** Hold any merchant, affiliate, or provider that does not sell specifically
in GBP, or is irrelevant to that market. **Do not delete** provider folders.
**Spend no more tokens** on hold ids (no enable tips, no fix FRs). Keep main
UK-capable networks and merchant platforms. Affiliates: prefer best UK coverage.

Parent FR pack: [feature-request-gbp-market-hold-2026-10-14.md](feature-request-gbp-market-hold-2026-10-14.md)
(FR-252 docs; FR-253..255 registry disable; FR-256 backlog hold; FR-257 floors).

| Hold id | Why | Action |
|---------|-----|--------|
| `bol` | Benelux NL/BE; EUR primary | Registry false both envs (FR-253); folder stays |
| `aliexpress` | Not GBP-native; weak club fit | Registry false both envs (FR-254); folder stays |
| `avantlink` | US outdoor/retail feeds | Registry false both envs (FR-255); folder stays |
| `flexoffers` | US mid-tail feeds | Stay dark; close enable backlog (FR-256) |
| `admitad` | Broad geo; weak GBP focus | Stay dark; no reopen (FR-256) |

Keep (continue when needed): `amazon` (amazon.co.uk), `ebay`, `rakuten`, `cj`,
`kelkoo`, `skimlinks`, `etsy`, `awin`, `impact`, `partnerize`, `tradedoubler`,
`webgains` path, and merchant platforms `shopify` / `wix` / `woocommerce` (+ later
GBP shop connects).


## Registry candidates (all in repo this pass)

| id | Kind | Default enabled | Why include | Implementation note |
|----|------|-----------------|-------------|---------------------|
| `amazon` | live | true | Core Madeira demand | **LOCKED Phase 1:** PA-API SearchItems (FR-030). **FR-181:** Creators behind flag (default off); PA-API remains live; FR-182+ |
| `ebay` | live | true | Marketplace coverage | Browse API OAuth; port from `eBay.js` |
| `awin` | local | true | Canonical aggregator -> local FTS | Product **datafeeds** ingest + local search (not Awin reporting API) |
| `rakuten` | live | true | Real Product Search API | Keyword search; XML; 100 calls/min; optional later local-feed twin |
| `cj` | live | true | Best next network search API | GraphQL Product Search `ads.api.cj.com` |
| `impact` | local | true | DTC/brand gaps | Catalog feeds -> local index |
| `partnerize` | local | true | Travel/finance depth | Enabled FR-172; MSSQL Parts + feed hooks |
| `webgains` | local | false | EU retail | Overlaps Awin; useful as second EU feed |
| `tradedoubler` | local | true | EU aggregator | Same local pattern as Awin |
| `admitad` | local | false | **HOLD** broad geo / weak GBP | Stay dark (FR-256); do not enable |
| `kelkoo` | live | true | Shopping/offer search | Enabled FR-167; price-comparison shape |
| `skimlinks` | live | true | Meta across many networks | Enabled FR-168; one API many nets |
| `aliexpress` | live | false (**HOLD**) | Not GBP-native | Disable both envs FR-254; folder stays |
| `etsy` | live | true | Handmade/niche | Enabled FR-170; Open API v3; smaller club overlap |
| `bol` | live | false (**HOLD**) | NL/BE Benelux EUR | Disable both envs FR-253; folder stays |
| `flexoffers` | local | false | **HOLD** US mid-tail | Stay dark (FR-256); do not enable |
| `avantlink` | local | false (**HOLD**) | US outdoor/retail | Disable both envs FR-255; folder stays |
| `shopify` | local | true | Merchant store catalogues (Madeira) | Admin API -> MSSQL Parts; enable per merchant |
| `wix` | local | true | Merchant store catalogues (Madeira) | Enabled FR-179; Wix Stores API -> MSSQL Parts; no affiliate stamp |
| `woocommerce` | local | false | Merchant store catalogues (Madeira) | WooCommerce REST -> MSSQL Parts |

**This pass:** scaffold **all rows** (folder, `.env.example`, worker stub,
queue name placeholder, registry entry). Defaults above set who is on at
first deploy; every id remains individually switchable.

**Phase 2 (FR-061):** complete remaining stubs with fixture-backed clients while
keeping registry `enabled` false until credentials exist - see
`docs/phase2-providers.md` (CAST IRON stay-dark).

**Phase 3 enable (FR-126):** one-provider enable ritual (credentials, selftest,
flip only that id, pin others stay dark) - see
`docs/phase3-enable-provider.md`. Do not bulk-enable Phase-2 ids.

## Example `providers/registry.json`

```json
{
  "sources": [
    { "id": "amazon", "kind": "live", "folder": "providers/live/amazon", "enabled": { "live": true, "sandbox": true }, "queueEnv": "SQS_AMAZON_URL" },
    { "id": "ebay", "kind": "live", "folder": "providers/live/ebay", "enabled": { "live": true, "sandbox": true }, "queueEnv": "SQS_EBAY_URL" },
    { "id": "rakuten", "kind": "live", "folder": "providers/live/rakuten", "enabled": { "live": true, "sandbox": true }, "queueEnv": "SQS_RAKUTEN_URL" },
    { "id": "cj", "kind": "live", "folder": "providers/live/cj", "enabled": { "live": true, "sandbox": true }, "queueEnv": "SQS_CJ_URL" },
    { "id": "kelkoo", "kind": "live", "folder": "providers/live/kelkoo", "enabled": { "live": true, "sandbox": true }, "queueEnv": "SQS_KELKOO_URL" },
    { "id": "skimlinks", "kind": "live", "folder": "providers/live/skimlinks", "enabled": { "live": true, "sandbox": true }, "queueEnv": "SQS_SKIMLINKS_URL" },
    { "id": "aliexpress", "kind": "live", "folder": "providers/live/aliexpress", "enabled": { "live": false, "sandbox": false }, "queueEnv": "SQS_ALIEXPRESS_URL" },
    { "id": "etsy", "kind": "live", "folder": "providers/live/etsy", "enabled": { "live": true, "sandbox": true }, "queueEnv": "SQS_ETSY_URL" },
    { "id": "bol", "kind": "live", "folder": "providers/live/bol", "enabled": { "live": false, "sandbox": false }, "queueEnv": "SQS_BOL_URL" },
    { "id": "awin", "kind": "local", "folder": "providers/local/awin", "enabled": { "live": true, "sandbox": true }, "queueEnv": "SQS_AWIN_URL" },
    { "id": "impact", "kind": "local", "folder": "providers/local/impact", "enabled": { "live": true, "sandbox": true }, "queueEnv": "SQS_IMPACT_URL" },
    { "id": "partnerize", "kind": "local", "folder": "providers/local/partnerize", "enabled": { "live": true, "sandbox": true }, "queueEnv": "SQS_PARTNERIZE_URL" },
    { "id": "webgains", "kind": "local", "folder": "providers/local/webgains", "enabled": { "live": false, "sandbox": false }, "queueEnv": "SQS_WEBGAINS_URL" },
    { "id": "tradedoubler", "kind": "local", "folder": "providers/local/tradedoubler", "enabled": { "live": true, "sandbox": true }, "queueEnv": "SQS_TRADEDOUBLER_URL" },
    { "id": "admitad", "kind": "local", "folder": "providers/local/admitad", "enabled": { "live": false, "sandbox": false }, "queueEnv": "SQS_ADMITAD_URL" },
    { "id": "flexoffers", "kind": "local", "folder": "providers/local/flexoffers", "enabled": { "live": false, "sandbox": false }, "queueEnv": "SQS_FLEXOFFERS_URL" },
    { "id": "avantlink", "kind": "local", "folder": "providers/local/avantlink", "enabled": { "live": false, "sandbox": false }, "queueEnv": "SQS_AVANTLINK_URL" },
    { "id": "shopify", "kind": "local", "folder": "providers/local/shopify", "enabled": { "live": true, "sandbox": true }, "queueEnv": "SQS_SHOPIFY_URL" },
    { "id": "wix", "kind": "local", "folder": "providers/local/wix", "enabled": { "live": false, "sandbox": false }, "queueEnv": "SQS_WIX_URL" },
    { "id": "woocommerce", "kind": "local", "folder": "providers/local/woocommerce", "enabled": { "live": false, "sandbox": false }, "queueEnv": "SQS_WOOCOMMERCE_URL" }
  ]
}
```

Optional request override (UNKNOWN until locked): body field
`sources: ["amazon","awin"]` may further restrict fan-out to a subset of
**already enabled** registry ids (never enables a disabled id).

## Do not add

| Name | Reason |
|------|--------|
| ShareASale | Closed; use Awin |
| PartnerStack | B2B SaaS, not retail product search |
| ClickBank | Digital info products, wrong catalogue shape |
| Generic scrapers | Not affiliate-safe deep links |

## HTTP accept (LOCKED)

`POST /search` returns **200** with `searchId` when the job is accepted.
Provider workers run offline from SQS; the HTTP call does not wait for results.
