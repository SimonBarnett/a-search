# Catalog, products and ASINs (FR-115)

How a-search search inputs (`catalogId`, `category`, `subcategory`, `source`)
and product results map onto Club Madeira **`madeiradb` dbo** tables. Inventory
baseline: read-only pass **2026-10-08** (see also open FR-113 `docs/data-model.md`
when merged; identity codes: [identity.md](identity.md) / FR-114).

**No credentials:** never quote `UserApiKeys.api_key_data` or any secret column.

## a-search field -> dbo column map

| a-search term | dbo home | Notes |
|---------------|----------|-------|
| JWT `userId` | `Users.user_id` / `Catalog.UserId` / `Products.UserId` / ... | 8-char code (`^[0-9A-Z]{8}$`); see [identity.md](identity.md) |
| `catalogId` | **`Catalog.ID`** (`int IDENTITY` PK) | Must be a Catalog row **owned by** the JWT `userId` (`Catalog.UserId`). HTTP body may send string or number; treat as int Catalog.ID. |
| `category` | `Catalog.MainCategory` / `Products.Category` / `RejectedAsins.MainCategory` | Club main category label |
| `subcategory` | `Catalog.SubCategory` / `Products.Subcategory` / `RejectedAsins.SubCategory` | Club subcategory; one Catalog row = one club subcategory |
| `source` (registry id) | `Products.Source` / `RejectedAsins.AffiliateKey` / `CatalogAffiliateUpdates.AffiliateKey` / `MerchantProducts` source | Case differs in DB -- see mapping table below |
| product `id` | `ASIN` | Provider product id stored in `ASIN` columns (Amazon ASIN, eBay item id, Awin product id, ...) |
| accept result | **`Products`** | Per-club curated accepted items |
| reject result | **`RejectedAsins`** | Per-club rejected ASINs |
| merchant catalogue | **`MerchantProducts`** | Merchant-side feed rows (`UserId` = merchant code) |
| merchant <-> club bridge | **`MerchantCatalog`** | 0 rows as of 2026-10-08; columns include `MerchantID`, `CommunityID`, `MerchantProductID`, `ASIN` |

## Catalog (club subcategory)

652 rows; 10 distinct `UserId` values (9 community + `L7WDZWC8`).

| Column | Role |
|--------|------|
| `ID` | PK -- this is a-search **`catalogId`** |
| `UserId` | Owning club / user code (nvarchar; logical link, no FK) |
| `MainCategory`, `SubCategory` | Category pair |
| `SearchTerms`, `RelevantKeywords`, `IrrelevantKeywords` | Search aids |
| `Icon`, `MainCategoryOrder`, `SubCategoryOrder`, `Notes`, `ProcessedBatchId` | UI / batch metadata |

**Unique key:** `(UserId, MainCategory, SubCategory)`.

## CatalogAffiliateUpdates (per-catalog per-source schedule)

1,956 rows. **PK** `(CatalogId, AffiliateKey)`. **FK** `CatalogId` -> `Catalog.ID` **ON DELETE CASCADE**.

| Column | Role |
|--------|------|
| `LastUpdate`, `NextCheck` | Schedule |
| `Status` | default `idle`; also Idle / completed / results_ready |
| `S3File`, `BatchName` | Result pointer / batch |

AffiliateKey population (snapshot): `awin` 652, `eBay` 652, `paapi` 652.

View **`Searches`** joins CatalogAffiliateUpdates to Catalog where `S3File` is not
null. Proc **`QueueCatalog(@UserId, @Source)`** re-queues by backdating
`LastUpdate`. This is the existing per-catalog, per-source search schedule a-search
must not invent a second conflicting queue for.

## Products (accepted, per-club)

325,240 rows; 13 distinct UserIds. Source mix: `ebay` 287,400, `paapi` 33,649,
`awin` 4,191.

| Column | Role |
|--------|------|
| `ASIN` | Product id (nvarchar(64)) |
| `Category` / `Subcategory` | Match Catalog Main/Sub |
| `Title` | nvarchar(max) |
| `Price` / `Discount` / `WasPrice` | **nvarchar(50) display strings**, not decimals |
| `AffiliateUrl`, `ThumbnailUrl`, `Mpn`, `Brand`, `Features`, `Specifications` | Presentation |
| `Reason` | nvarchar(255); populated on most rows |

**Unique key:** `(UserId, Category, Subcategory, ASIN, Source)`.

Any a-search writer that upserts into Products **must** respect this UQ -- no
duplicate `(UserId, Category, Subcategory, ASIN, Source)`.

## RejectedAsins

656,155 rows; 15 distinct UserIds. AffiliateKey mix: eBay 538,236 / awin 62,123 /
paapi 55,796.

| Column | Role |
|--------|------|
| `ASIN` | nvarchar(128) |
| `MainCategory`, `SubCategory` | CHECK both non-empty |
| `AffiliateKey` | Source key (note `eBay` casing) |
| `Reason`, `RejectedAt` | Audit |

**Unique key:** `(UserId, AffiliateKey, MainCategory, SubCategory, ASIN)`.

## MerchantProducts (merchant-side catalogue)

2,594,319 rows; ~152 distinct UserIds (151 merchant). Source: `awin` almost all;
`wixStore` 16.

| Column | Role |
|--------|------|
| `UserId` | **Merchant** code (not the searching club) |
| `ASIN` | Merchant product id (inferred) |
| `Title`, string Price/Discount/WasPrice, `AffiliateUrl` | Presentation |
| `CategoryId`, `CategoryName`, `Mpn`, `Brand`, ... | Taxonomy / attributes |
| `ProcessedBatchId` | Feed batch |

PK `PK_MerchantProducts(ID)` was **disabled** (heap) in the FR-113 inventory;
bulk-load procs disable/rebuild indexes around feeds.

## Source id mapping (a-search registry <-> DB)

a-search `providers/registry.json` ids are lowercase. madeiradb often uses
different spellings:

| a-search registry `source` | Typical DB `Source` / `AffiliateKey` | Notes |
|----------------------------|--------------------------------------|-------|
| `amazon` | `paapi` | Amazon PA-API historical key |
| `ebay` | `eBay` **or** `ebay` | CatalogAffiliateUpdates / RejectedAsins use `eBay`; Products uses `ebay` |
| `awin` | `awin` | Local feed / affiliate |
| `wix` / merchant feeds | `wixStore` (MerchantProducts) | Merchant catalogue only in snapshot |
| other registry ids (`cj`, `rakuten`, `impact`, Phase-2 stubs, ...) | **not present** in CatalogAffiliateUpdates snapshot | New sources need an explicit AffiliateKey convention before writing schedule rows |

When reading or writing, normalize carefully: do not assume `ebay` == `eBay`
without a translation layer.

## Prices: DB strings vs result-schema number

madeiradb stores `Price` / `Discount` / `WasPrice` as **nvarchar display
strings** (currency symbols, commas, free text). a-search
[result-schema.md](result-schema.md) exposes optional JSON **`price` as a
number** for callers.

| Layer | Shape |
|-------|-------|
| `Products` / `MerchantProducts` | display string columns |
| a-search results JSON | optional numeric `price` + optional `currency` |

Workers that read SQL must parse display strings when emitting numeric
`price`, or leave `price` omitted when parsing is unsafe. Do not invent a
decimal column in docs that the DB does not have.

## Read paths: `Part` / `Part2` and tracked links

- **`dbo.Part`** -- unions `MerchantCatalog`+`MerchantProducts` with `Products`.
- **`dbo.Part2`** -- reads **Products only** and rewrites affiliate links at
  **read time**:
  - `paapi`: replaces `tag=mymodelflying-21` with
    `tag=mymodelflying-<lower(UserId)>-21`
  - `awin`: appends `&clickref=<UserId>`

a-search workers that already stamp tenant via
[tracked-links.md](tracked-links.md) / `buildTrackedUrl` (FR-057) must **not**
double-tag URLs that will also pass through `Part2`, and must not assume
`Part2` runs on S3 result JSON (it is a SQL read helper). See the Part2 note
in tracked-links.md.

## UserApiKeys (feed state -- no secrets in docs)

Feed progress per merchant lives on `UserApiKeys`: `api_key_type` (awin /
wixStore / bigcommerce counts in snapshot), `LastStatus`, `CurrentBatchId`,
`BatchStartedAt`, `TotalParts`, `count_inserted`, `count_updated`.

**`api_key_data` holds credentials -- never log, never paste into docs or
fixtures.**

Ops note (snapshot): Products / RejectedAsins / CatalogAffiliateUpdates last
wrote ~2026-09-23 19:12 (evening of RDS -> IONOS move). Several UserApiKeys
rows stuck since ~21:02-21:14 with `LastStatus=500` and `CurrentBatchId` set.

## Related docs

- [endpoint-search.md](endpoint-search.md) -- HTTP `catalogId` / category fields
- [result-schema.md](result-schema.md) -- JSON product shape + numeric price
- [tracked-links.md](tracked-links.md) -- create-time tracking vs Part2 rewrite
- [identity.md](identity.md) -- 8-char user / partner / club codes (FR-114)
- [data-model.md](data-model.md) -- full dbo inventory (FR-113, when present)
