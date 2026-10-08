# madeiradb data model (dbo)

Verified facts about Club Madeira **`madeiradb`**. Full table inventory / ERD:
FR-113. Club scans disambiguation: FR-116. Identity codes: FR-114. Catalog map:
FR-115.

**As of:** 2026-10-08 read-only inventory unless noted.

## Integrity

madeiradb must **not** be assumed referentially intact for user, partner or club
codes. a-search joins that resolve a JWT `userId` (or partner/club code) to DB
rows must tolerate orphans and **fail closed** (return empty — do not error, do
not invent rows).

### Enforced foreign keys (only five)

| Relationship | Kind |
|--------------|------|
| `CatalogAffiliateUpdates.CatalogId` -> `Catalog.ID` (ON DELETE CASCADE) | **enforced FK** |
| `amazon_cards` -> `claimant` | **enforced FK** |
| `cmsDocLinks` -> `cmsProvider` | **enforced FK** |
| `DocLinks` -> `ApiProvider` | **enforced FK** |
| `UserApiKeys.user_id` -> `Users.user_id` | **enforced FK** |

### Logical-only user / partner / club links

| Relationship | Kind |
|--------------|------|
| `Catalog.UserId` -> `Users.user_id` | **logical only** |
| `Products.UserId` -> `Users.user_id` | **logical only** |
| `MerchantProducts.UserId` -> `Users.user_id` | **logical only** |
| `RejectedAsins.UserId` -> `Users.user_id` | **logical only** |
| `DatabaseCallLog.UserId` -> `Users.user_id` | **logical only** |
| `UserCategories.uid` -> `Users.user_id` | **logical only** |
| `UserFingerprints.user_id` -> `Users.user_id` | **logical only** |
| `SystemOTPs.user_id` -> `Users.user_id` | **logical only** |
| `Payments.UserId` -> `Users.user_id` | **logical only** |
| `Commissions.MerchantId` -> `Users.user_id` | **logical only** |
| `Partner.PartnerID` -> `Users.user_id` (peer identity) | **logical only** |
| `clubscan.ClubID` / `clubscan.PartnerId` -> `Users` / `Partner` | **logical only** |
| `AwinHighApprovalMerchants.PartnerID` / `ClubID` -> codes | **logical only** |
| `AwinTransactions.ClubID` -> codes | **logical only** |
| `FingerprintCatalogAccess.catalog_id` -> `Catalog.ID` | **logical only** |

Code columns mix `varchar(8)` / `char(8)` / `nvarchar(8|50|100)`. Prefer
`CONVERT(varchar(8), RTRIM(...))` (or a-search `normalizeUserCode`) so joins do
not rely on implicit nvarchar/varchar conversion.

### Orphans observed (2026-10-08) — do not "fix" in a-search

| Column | Orphan rows | Example orphan codes |
|--------|------------:|----------------------|
| RejectedAsins.UserId | 132,628 | N05L5X8N, SHQB85I5, 4OETP8TP, M4H5GAFH, 5N54RO8O |
| Products.UserId | 366 | UTSKD5S9, 4OETP8TP |
| DatabaseCallLog.UserId | 121 | 606RVS6W, SHQB85I5, … |
| Payments.UserId | 22 | 2IHOQ2EV, 975F09W5 |
| Commissions.MerchantId | 19 | 2IHOQ2EV |
| UserCategories.uid | 2 | 4OETP8TP, M4H5GAFH |
| AwinHighApprovalMerchants.PartnerID | 6 | **2889699** (not an 8-char code) |
| AwinTransactions.ClubID | 84 of 85 | `TEST-…` / SellerID `SANDBOX` |
| FingerprintCatalogAccess.catalog_id | 210 | catalog ids 2344–7421 missing from Catalog |

No orphans (snapshot): Catalog.UserId, UserApiKeys, UserFingerprints, SystemOTPs,
clubscan.ClubID, CatalogAffiliateUpdates->Catalog. MerchantProducts clean aside
from ~14 NULL-UserId rows.

These codes are **not** the 2026-10-05 removal ids (MWRJCP92, MV69J0VA).
**Deleting or repairing orphans is out of scope for a-search** (DBA decision).

### a-search read contract

1. EXISTS-check / inner-join `dbo.Users` **before** returning user-scoped rows.
2. Missing user -> **empty result** (HTTP/search still 200 where applicable), never
   surface orphan-owned Products / RejectedAsins / etc.
3. Compare codes as trimmed upper-case `varchar(8)`-compatible strings.
4. Helper: `shared/mssql/orphanSafe.js` (`resolveTenantUser`, `readForTenantUser`).
5. Ops script: [`scripts/orphan-report.sql`](../scripts/orphan-report.sql) (SELECT only).

Example EXISTS gate:

```sql
AND EXISTS (
  SELECT 1 FROM dbo.Users AS u
  WHERE u.user_id = CONVERT(varchar(8), @userId)
)
```

### Orphan-check query template (per relationship)

```sql
SELECT <col> AS OrphanCode, COUNT_BIG(*) AS OrphanRows
FROM <table> AS t
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.Users AS u
  WHERE u.user_id = CONVERT(varchar(8), RTRIM(t.<col>))
)
GROUP BY <col>
ORDER BY OrphanRows DESC;
```

Replace `<table>` / `<col>` with each logical-only row above (or run
`scripts/orphan-report.sql`).
