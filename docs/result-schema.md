# a-search product result schema

Club Madeira callers merge multi-source results JSON. Every provider worker
must write product objects that share this top-level shape so callers do not
fork per-provider parsers.

Canonical helper: `worker/lib/normalizeProduct.js`
(`normalizeProduct`, `assertProductSchema`).

## Required fields

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Provider product id (ASIN, itemId, adId, ...). Empty string only for unusable rows. |
| `title` | string | Display title. |
| `source` | string | Registry provider id (`amazon`, `ebay`, `cj`, `rakuten`, ...). |

## Optional fields

| Field | Type | Notes |
|-------|------|--------|
| `url` | string | Product or tracking URL when known. |
| `price` | number | Numeric amount when known. |
| `currency` | string | ISO currency when known (e.g. `GBP`). |
| `imageUrl` | string | Primary image URL when known. |
| `description` | string | Longer text when known (local Parts / feeds). |
| `raw` | object | Optional provider-specific payload; never required by callers. |

## Rules

- Use `normalizeProduct({ ... })` (or assert with `assertProductSchema`) before
  writing results so top-level keys stay aligned.
- **Do not invent incompatible top-level keys** without updating this doc and
  the shared helper. Provider-specific extras belong under `raw`, not as new
  peer fields that callers must special-case.
- Missing required fields (`id`, `title`, `source`) fail `assertProductSchema`.



## Prices vs madeiradb

`price` in results JSON is an optional **number**. Club Madeira SQL tables
(`Products`, `MerchantProducts`) store `Price` / `Discount` / `WasPrice` as
**nvarchar display strings**, not decimals. When reading SQL, parse only when
safe; otherwise omit numeric `price`. See [catalog-model.md](catalog-model.md).

## Out of scope

- Grok relevance ranking and score fields (separate FR).
