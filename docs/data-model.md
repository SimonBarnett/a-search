# madeiradb data model (dbo)

Verified read-only inventory of Club Madeira's **`madeiradb`** on the IONOS
Windows SQL host (`WIN-MPRE8VI4U6U`). a-search workers and the parts
maintainer must treat this as the real schema until a later FR decides how
to map vision-era names (`Parts`, `PartFeedKeys`, `PartsStaging`,
`ImpactPendingOnboard`) onto what exists here.

**As of:** 2026-10-08 (row counts from that read-only pass).

| Fact | Value |
|------|-------|
| Engine | SQL Server 2022 Standard (16.0.4295.3) |
| Database | `madeiradb` (only user database on the instance) |
| Recovery | SIMPLE |
| Collation | `SQL_Latin1_General_CP1_CI_AS` |
| Schemas in scope | **`dbo` only** |
| Out of scope | `gf_bak` (2026-10-05 removal backups) |

**a-search owned tables (FR-120 decision a):** none of `dbo.Parts`,
`dbo.PartsStaging`, `dbo.PartFeedKeys`, or `dbo.ImpactPendingOnboard` exist
in madeiradb **yet**. a-search will create them via ops-applied
`maintainer/sql` migrations (runtime never DDL). Local Awin/Impact search
reads `dbo.Parts` — not `dbo.MerchantProducts` (heap / shape mismatch).
See [parts-maintainer.md](parts-maintainer.md) Decision (FR-120).

## Foreign keys (only five)

madeiradb has **five** declared foreign keys and **no triggers**.

| From | To | Notes |
|------|-----|-------|
| `CatalogAffiliateUpdates.CatalogId` | `Catalog.ID` | `ON DELETE CASCADE` |
| `amazon_cards` | `claimant` | |
| `cmsDocLinks` | `cmsProvider` | |
| `DocLinks` | `ApiProvider` | |
| `UserApiKeys.user_id` | `Users.user_id` | |

Identity / product / catalog joins on the **8-char user / partner / club
code** are almost all **logical (no FK)**. Do not assume cascading deletes
or referential integrity for those links.

## dbo table inventory

Row counts are **as of 2026-10-08**. PK / unique / FK columns come from the
same inventory; where the snapshot did not record a PK, the cell says
`not captured (refresh via sys.indexes)`.

| Table | Rows (as of 2026-10-08) | PK | Unique / notes | FKs |
|-------|------------------------:|----|----------------|-----|
| MerchantProducts | 2,594,319 | `PK_MerchantProducts` (`ID`) **disabled** (heap) | Full-text on Category, ASIN, Title, CategoryName, Mpn, Brand, Features, ProductDescription (**disabled**) | no FK |
| RejectedAsins | 656,155 | `ID` | UQ (`UserId`, `AffiliateKey`, `MainCategory`, `SubCategory`, `ASIN`) | no FK |
| Products | 325,240 | `ID` | UQ (`UserId`, `Category`, `Subcategory`, `ASIN`, `Source`); full-text on Title, Features | no FK |
| DatabaseCallLog | 20,324 | `ID` | | no FK |
| FingerprintCatalogAccess | 4,547 | `id` | | no FK |
| CatalogAffiliateUpdates | 1,956 | (`CatalogId`, `AffiliateKey`) | | FK -> `Catalog.ID` ON DELETE CASCADE |
| AwinHighApprovalMerchants | 1,480 | `MerchantId` (int) | columns include `PartnerID` nvarchar(8), `ClubID` varchar(8) | no FK |
| PostHogEvents | 1,106 | `id` | | no FK |
| Catalog | 652 | `ID` | UQ (`UserId`, `MainCategory`, `SubCategory`) | no FK |
| AwinRecommendedMerchants | 639 | `ID` | | no FK |
| AwinVoucher | 356 | none (heap) | | no FK |
| Users | 260 | `user_id` varchar(8) | club / tenant identity | no FK |
| UserFingerprints | 229 | `id` | | no FK |
| UserApiKeys | 159 | `id` | | FK `user_id` -> `Users.user_id` |
| amazon_cards | 86 | not captured (refresh via sys.indexes) | | FK -> `claimant` |
| AwinTransactions | 85 | not captured (refresh via sys.indexes) | | no FK |
| Payments | 44 | not captured (refresh via sys.indexes) | | no FK |
| VatBatch | 33 | not captured (refresh via sys.indexes) | | no FK |
| Commissions | 19 | not captured (refresh via sys.indexes) | | no FK |
| cmsDocLinks | 15 | not captured (refresh via sys.indexes) | | FK -> `cmsProvider` |
| DocLinks | 15 | not captured (refresh via sys.indexes) | | FK -> `ApiProvider` |
| claimant | 14 | not captured (refresh via sys.indexes) | | no FK |
| UserCategories | 14 | not captured (refresh via sys.indexes) | | no FK |
| SystemOTPs | 11 | not captured (refresh via sys.indexes) | | no FK |
| clubscan | 10 | not captured (refresh via sys.indexes) | club scan rows (not the madeira-awin-clubscan report Lambda) | no FK |
| ApiProvider | 6 | not captured (refresh via sys.indexes) | | no FK |
| cmsProvider | 5 | not captured (refresh via sys.indexes) | | no FK |
| LASTS | 4 | not captured (refresh via sys.indexes) | | no FK |
| Partner | 1 | not captured (refresh via sys.indexes) | partner identity | no FK |
| sqsMsgCount | 1 | not captured (refresh via sys.indexes) | | no FK |
| MerchantCatalog | 0 | `CatalogID` | | no FK |

### Purpose sketch (identity / product / catalog)

| Table | Purpose (ops reading) |
|-------|------------------------|
| Users | Tenant / club user keyed by 8-char `user_id` |
| Partner | Partner identity (logical peer of Users / clubscan) |
| clubscan | Live club-scan rows used by TVF `clubs()` with Partner |
| Catalog | Per-user category catalog; UQ on user + main/sub category |
| CatalogAffiliateUpdates | Per-catalog affiliate key updates (real FK to Catalog) |
| MerchantCatalog | CatalogID-keyed merchant catalog bridge (empty as of snapshot) |
| MerchantProducts | Large merchant product heap (indexes often disabled for bulk load) |
| Products | Per-user product rows (ASIN + Source scoped) |
| RejectedAsins | Rejected ASIN set per user / affiliate / category |
| UserCategories | User category preferences (logical -> Users) |
| UserApiKeys | API keys (FK -> Users) |
| UserFingerprints | Fingerprint rows (logical -> Users) |

## Views, functions, procedures

| Kind | Names |
|------|-------|
| Views | `Searches`, `Sum_Merchant_Parts`, `vw_ActiveClubs_Last72Hours` |
| Functions | `clubs()`, `Part`, `Part2`, `Menu`, `PartnerSites`, `UserCatalog`, `fn_ClubScanIsActive`, `traffic`, `TrafficAv`, `fn_GetTableIndexes` |
| Procs | `GenerateUniqueUserId`, `QueueCatalog`, `DisableMerchantIndexes`, `RebuildMerchantIndexes`, `IsIndexDisabledForBulkLoad`, `KillAndRestartRebuild`, `StartAsyncIndexRebuild`, `sp_ClaimVoucher` |

**Note:** `clubs` is an **inline table-valued function** over `clubscan` +
`Partner`, not a base table.

## Agent jobs (ops context)

Both jobs schedule daily at 02:00 and succeeded 06-08 Oct 2026:

| Job | What it does |
|-----|----------------|
| `Madeira_Nightly_Maintenance` | `UPDATE STATISTICS` on MerchantProducts and Products (10% sample), then `BACKUP DATABASE` to a local disk file |
| `Madeira_Local_NightlyStats` | `UPDATE STATISTICS ... WITH FULLSCAN` on MerchantProducts, Products, RejectedAsins |

## ERD (identity, product, catalog)

Solid relationships = declared FK. Labels marked **logical (no FK)** are
joins on the 8-char user / partner / club code with no foreign key.

```mermaid
erDiagram
  Users ||--o{ UserApiKeys : "FK user_id"
  Catalog ||--o{ CatalogAffiliateUpdates : "FK CatalogId CASCADE"

  Users ||..o{ Catalog : "logical (no FK) UserId"
  Users ||..o{ Products : "logical (no FK) UserId"
  Users ||..o{ MerchantProducts : "logical (no FK) user code"
  Users ||..o{ RejectedAsins : "logical (no FK) UserId"
  Users ||..o{ UserCategories : "logical (no FK)"
  Users ||..o{ UserFingerprints : "logical (no FK)"
  Users ||..o{ clubscan : "logical (no FK) club/user code"
  Users ||..o{ Partner : "logical (no FK) partner/user code"

  Partner ||..o{ clubscan : "logical (no FK); clubs() TVF"
  Catalog ||..o{ MerchantCatalog : "logical (no FK) CatalogID"
  Catalog ||..o{ Products : "logical (no FK) category pair"
  Catalog ||..o{ MerchantProducts : "logical (no FK) category pair"

  claimant ||--o{ amazon_cards : "FK"
  cmsProvider ||--o{ cmsDocLinks : "FK"
  ApiProvider ||--o{ DocLinks : "FK"

  Users {
    varchar user_id PK
  }
  Partner {
    string partner_code
  }
  clubscan {
    string club_or_user_code
  }
  Catalog {
    int ID PK
    string UserId
  }
  CatalogAffiliateUpdates {
    int CatalogId FK
    string AffiliateKey
  }
  MerchantCatalog {
    int CatalogID PK
  }
  MerchantProducts {
    int ID PK_disabled
  }
  Products {
    int ID PK
    string UserId
  }
  RejectedAsins {
    int ID PK
    string UserId
  }
  UserApiKeys {
    int id PK
    varchar user_id FK
  }
  UserCategories {
    string user_code
  }
  UserFingerprints {
    int id PK
  }
  claimant {
    string id
  }
  amazon_cards {
    string claimant_ref FK
  }
  cmsProvider {
    string id
  }
  cmsDocLinks {
    string provider_ref FK
  }
  ApiProvider {
    string id
  }
  DocLinks {
    string provider_ref FK
  }
```

## How to refresh this doc

Use **read-only** catalog queries on the SQL host. Do not paste credentials,
connection strings with passwords, or SAS tokens into this file or into
intake filings.

```sql
-- Tables + approximate rows
SELECT s.name AS schema_name, t.name AS table_name, SUM(p.rows) AS row_count
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE s.name = N'dbo'
GROUP BY s.name, t.name
ORDER BY row_count DESC, t.name;

-- Columns
SELECT s.name AS schema_name, t.name AS table_name, c.column_id, c.name, ty.name AS type_name, c.max_length, c.is_nullable
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE s.name = N'dbo'
ORDER BY t.name, c.column_id;

-- Indexes / PKs / unique
SELECT OBJECT_SCHEMA_NAME(i.object_id) AS schema_name,
       OBJECT_NAME(i.object_id) AS table_name,
       i.name AS index_name, i.is_primary_key, i.is_unique, i.is_disabled, i.type_desc
FROM sys.indexes i
WHERE OBJECT_SCHEMA_NAME(i.object_id) = N'dbo' AND i.name IS NOT NULL
ORDER BY table_name, i.is_primary_key DESC, index_name;

-- Foreign keys
SELECT fk.name AS fk_name,
       OBJECT_SCHEMA_NAME(fk.parent_object_id) AS from_schema,
       OBJECT_NAME(fk.parent_object_id) AS from_table,
       COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS from_column,
       OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS to_schema,
       OBJECT_NAME(fk.referenced_object_id) AS to_table,
       COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS to_column,
       fk.delete_referential_action_desc
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
ORDER BY from_table, fk_name;
```

After refresh: update the **As of** date, row counts, PK/FK cells, and the
ERD. Keep `gf_bak` out of scope unless a-search explicitly starts reading it.

## Related docs

- Vision UNKNOWN (was exact MSSQL table names): [vision.md](vision.md)
- Parts maintainer (assumes PartFeedKeys / Parts): [parts-maintainer.md](parts-maintainer.md)
- Impact pending-onboard queue DDL (a-search-owned, may not exist on madeiradb yet): [impact-pending-onboard-queue.md](impact-pending-onboard-queue.md)
