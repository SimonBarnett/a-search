# a-search — provider shortlist (this pass)

Every likely candidate ships as its **own folder + `.env` + SQS queue**, listed in
`providers/registry.json` with an individual **`enabled`** flag. Entry fan-out
only enqueues sources where `enabled: true`. Operators flip flags without code
edits.

Kinds: **live** (remote search API on each SQS job) vs **local** (owned part
data / feed ingest — Awin-style).

Legacy reference: Amazon PA-API, eBay Browse, Awin-as-local (`MerchantProducts`).
ShareASale is **not** a candidate (merged into Awin; API gone Oct 2025).

## Registry candidates (all in repo this pass)

| id | Kind | Default enabled | Why include | Implementation note |
|----|------|-----------------|-------------|---------------------|
| `amazon` | live | true | Core Madeira demand | Prefer Associates **Creators API** / current approved search; PA-API v5 retiring |
| `ebay` | live | true | Marketplace coverage | Browse API OAuth; port from `eBay.js` |
| `awin` | local | true | Canonical aggregator → local FTS | Product **datafeeds** ingest + local search (not Awin reporting API) |
| `rakuten` | live | true | Real Product Search API | Keyword search; XML; 100 calls/min; optional later local-feed twin |
| `cj` | live | true | Best next network search API | GraphQL Product Search `ads.api.cj.com` |
| `impact` | local | true | DTC/brand gaps | Catalog feeds → local index |
| `partnerize` | local | false | Travel/finance depth | Feed-heavy; enable when programmes joined |
| `webgains` | local | false | EU retail | Overlaps Awin; useful as second EU feed |
| `tradedoubler` | local | false | EU aggregator | Same local pattern as Awin |
| `admitad` | local | false | Broad geo | Quality varies by market |
| `kelkoo` | live | false | Shopping/offer search | Price-comparison shape; different result schema |
| `skimlinks` | live | false | Meta across many networks | One API many nets; enable if first-class nets are thin |
| `aliexpress` | live | false | Volume/price | Compliance heavier for club catalogues |
| `etsy` | live | false | Handmade/niche | Open API v3; smaller club overlap |
| `bol` | live | false | NL/BE marketplace | Enable only for Benelux launch |
| `flexoffers` | local | false | US mid-tail feeds | After Impact |
| `avantlink` | local | false | US outdoor/retail feeds | After Impact |

**This pass:** scaffold **all rows** (folder, `.env.example`, worker stub,
queue name placeholder, registry entry). Defaults above set who is on at
first deploy; every id remains individually switchable.

## Example `providers/registry.json`

```json
{
  "sources": [
    { "id": "amazon", "kind": "live", "folder": "providers/live/amazon", "enabled": true, "queueEnv": "SQS_AMAZON_URL" },
    { "id": "ebay", "kind": "live", "folder": "providers/live/ebay", "enabled": true, "queueEnv": "SQS_EBAY_URL" },
    { "id": "rakuten", "kind": "live", "folder": "providers/live/rakuten", "enabled": true, "queueEnv": "SQS_RAKUTEN_URL" },
    { "id": "cj", "kind": "live", "folder": "providers/live/cj", "enabled": true, "queueEnv": "SQS_CJ_URL" },
    { "id": "kelkoo", "kind": "live", "folder": "providers/live/kelkoo", "enabled": false, "queueEnv": "SQS_KELKOO_URL" },
    { "id": "skimlinks", "kind": "live", "folder": "providers/live/skimlinks", "enabled": false, "queueEnv": "SQS_SKIMLINKS_URL" },
    { "id": "aliexpress", "kind": "live", "folder": "providers/live/aliexpress", "enabled": false, "queueEnv": "SQS_ALIEXPRESS_URL" },
    { "id": "etsy", "kind": "live", "folder": "providers/live/etsy", "enabled": false, "queueEnv": "SQS_ETSY_URL" },
    { "id": "bol", "kind": "live", "folder": "providers/live/bol", "enabled": false, "queueEnv": "SQS_BOL_URL" },
    { "id": "awin", "kind": "local", "folder": "providers/local/awin", "enabled": true, "queueEnv": "SQS_AWIN_URL" },
    { "id": "impact", "kind": "local", "folder": "providers/local/impact", "enabled": true, "queueEnv": "SQS_IMPACT_URL" },
    { "id": "partnerize", "kind": "local", "folder": "providers/local/partnerize", "enabled": false, "queueEnv": "SQS_PARTNERIZE_URL" },
    { "id": "webgains", "kind": "local", "folder": "providers/local/webgains", "enabled": false, "queueEnv": "SQS_WEBGAINS_URL" },
    { "id": "tradedoubler", "kind": "local", "folder": "providers/local/tradedoubler", "enabled": false, "queueEnv": "SQS_TRADEDOUBLER_URL" },
    { "id": "admitad", "kind": "local", "folder": "providers/local/admitad", "enabled": false, "queueEnv": "SQS_ADMITAD_URL" },
    { "id": "flexoffers", "kind": "local", "folder": "providers/local/flexoffers", "enabled": false, "queueEnv": "SQS_FLEXOFFERS_URL" },
    { "id": "avantlink", "kind": "local", "folder": "providers/local/avantlink", "enabled": false, "queueEnv": "SQS_AVANTLINK_URL" }
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
