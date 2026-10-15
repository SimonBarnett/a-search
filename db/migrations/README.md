# a-search DB migrations (FR-251 / FR-196)

**Target databases:** `a_search` (live) and `a_search_sandbox` (sandbox).

**CAST IRON:** never run these scripts against **madeiradb**. madeiradb is read-only for a-search (FR-251 / #1365). Club/partner identity is read from `mdb.*` only.

Apply with `node scripts/db-migrate.js` (migrator secret; refuses wrong `DB_NAME()`).

## Scripts

| file | purpose |
|------|---------|
| `000_SchemaMigrations.sql` | Migration ledger (FR-251) |
| `001_Customers.sql` | Customers + upgrade cache (FR-196) |
| `002_Widgets.sql` | Widgets registry (FR-232) |
| `003_PartFeedKeys.sql` | PartFeedKeys (from maintainer/sql) |
| `004_Parts.sql` | Parts |
| `005_PartsStaging.sql` | PartsStaging |
| `006_MergeParts.sql` | MergeParts proc |
| `007_DeleteMissingParts.sql` | DeleteMissingParts proc |
| `008_ImpactPendingOnboard.sql` | Impact onboarding queue |
| `010_Shops.sql` | Merchant Shops (FR-216 / FR-235) |
| `011_ShopStatusLog.sql` | Shop status log (FR-235) |
| `012_PartFeedKeys_shop_kind.sql` | PartFeedKeys shop/kind |
| `013_RevenueShare.sql` | Club revenue share (FR-249) |
| `014_mdb_identity_views.sql` | `mdb.*` live views / sandbox tables (FR-251) |
| `015_AmazonTrackingIds.sql` | Amazon per-tenant partner tags (FR-248 / #1362)

Every file starts with `-- target: a_search`.