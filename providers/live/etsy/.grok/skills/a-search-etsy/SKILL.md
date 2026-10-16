---
name: a-search-etsy
description: >
  Maintain a-search etsy live API provider worker. Use in providers/live/etsy.
---

# a-search etsy (live)

Registry folder `providers/live/etsy`. Kind: live PROVIDER. Enabling flips are
FR-170; auth + affiliate deep links are FR-244.

## Search path (FR-075 / FR-244)

`src/search.js` -- injectable `httpRequest`, Open API v3
`GET /application/listings/active` with `includes=Images`.
`x-api-key` = `keystring:shared_secret` (`ETSY_API_KEY` + `ETSY_SHARED_SECRET`).
If the key env already contains `:`, use as-is. Missing secret ->
`missing_shared_secret`. Fixture `fixtures/listings-ok.json`
(`etsyProductAPI.results[]`).

## Normalize (FR-076 / FR-244)

`src/normalize.js` maps Open API listing JSON to `worker/lib/normalizeProduct`.
Listing `url` / `url_full` go through `src/affiliateUrl.js`:
Rakuten deep link (default) or Awin cread.php. Clean query/fragment first.
Fail closed when affiliate ids missing (never emit raw listing URL).

| Etsy field | Product field |
|------------|---------------|
| `listing_id` / `id` | `id` |
| `title` | `title` |
| `url` / `url_full` | `url` via FR-244 affiliate wrap |
| `images[0].url_570xN` | `imageUrl` |
| `price.amount` / `price.divisor` | `price` (major units) |
| `price.currency_code` | `currency` |
| `description` / `shop_name` | `description` |

## Worker (FR-077)

`src/worker.js` -- `run(msg, deps)` wires `assertWorkerEnv` -> `assertEtsyCreds` ->
`searchEtsy` -> `normalizeSearchResponse` -> `writeResults`.

## Selftest + pacing (FR-078)

`src/selftestProbe.js` -- credential check (distinct `missing_shared_secret`) +
fixture or injectable HTTP for `/selftest`. Registry `rateLimit`:
`maxConcurrency: 1`, `minIntervalMs: 250` (FR-244 auth still applies).


## Env

See `.env.example`. Queue: `SQS_ETSY_URL`. Creds: `ETSY_API_KEY` (+ optional
`ETSY_KEYSTRING`) + `ETSY_SHARED_SECRET`. Affiliate: `ETSY_AFFILIATE_NETWORK`
(default rakuten), `ETSY_RAKUTEN_MID`, `RAKUTEN_PUBLISHER_ID` (or `RAKUTEN_SITE_ID`).

## Harvested lessons

- Phase-2 etsy stay-dark stack (search -> normalize -> worker -> selftest): CAST IRON
  in this skill + `docs/phase2-providers.md`. Relocated sources: bobiverse#3366+.
- FR-244: x-api-key keystring:secret; Rakuten deeplink u1=tenantId; Awin fallback only.
