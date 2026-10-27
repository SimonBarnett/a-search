# Awin `_import` - dbimport instructions

Used by `dbimport` (`C:\ai\a-search\tools\dbimport.ps1`) when the cwd is
`S:\a-affiliates`, `S:\a-affiliates\awin`, or `S:\a-affiliates\awin\{merchantId}`.

## Database

- Instance: `walrus\asearch`
- Database: `a_search` (never madeiradb)
- Auth: Windows integrated

## Inputs (per merchant folder)

| File | Target |
|------|--------|
| `{yyyy-mm-dd}.csv` | `dbo.Parts` - upsert; soft-delete missing from batch |
| `{yyyy-mm-dd}.coupons.json` | `dbo.AffiliateOffers` - upsert; soft-delete missing |

Newest dated file of each type is imported. After success both files are **deleted** from S3.

Dated `.csv` objects may still be gzip (or zip) when the affiliate marker has
`compression=none` but Awin returned compressed bytes. `parseAwin.js` sniffs
magic bytes (`1f 8b` / `PK`) and decompresses before CSV parse. Fresh downloads
also sniff when `compression=none` so new objects are plain text.

## Parts mapping (Awin CSV -> Parts)

| CSV column | Parts column |
|------------|--------------|
| `merchant_product_id` (else `aw_product_id`) | `MerchantProductId` |
| `product_name` | `Title` |
| `description` | `Description` |
| `aw_deep_link` / `merchant_deep_link` | `Url` |
| `aw_image_url` / `merchant_image_url` | `ImageUrl` |
| `search_price` / `store_price` | `Price` |
| `currency` | `Currency` |

`Source=awin`, `FeedKey={merchantId}`, `Env=live` (see `config.json`).

Safety: refuse import when staging is empty or would soft-delete more than `maxRemoveRatio` of active rows (default 0.5).

## Coupons

See `sql/001_AffiliateOffers.sql`. Offers keyed by `(Source, FeedKey, PromotionId, Env)`.

## Commands

```powershell
cd S:\a-affiliates\awin\100597
dbimport -WhatIf
dbimport

cd S:\a-affiliates\awin
dbimport -MerchantId 100597
```