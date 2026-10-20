# a-search DB migrations (FR-251 / FR-196)

**Target databases:** `a_search` (live) and `a_search_sandbox` (sandbox).

**CAST IRON:** never run these scripts against **madeiradb**. madeiradb is read-only for a-search (FR-251 / #1365). Club/partner identity is read from `mdb.*` only.

Apply with `node scripts/db-migrate.js` (migrator secret; refuses wrong `DB_NAME()`).

**Trusted Windows auth (FR #4548):** set `MSSQL_TRUSTED_CONNECTION=true` plus
`MSSQL_SERVER` / `MSSQL_DATABASE`. The migrator uses `msnodesqlv8` with
`MSSQL_ODBC_DRIVER` (default `ODBC Driver 17 for SQL Server`). Optional
`MSSQL_CONNECTION_STRING` overrides the built ODBC string. Do not rely on the
msnodesqlv8 default (`SQL Server Native Client 11.0`) --- it is often missing.

## Scripts

| file | purpose |
|------|---------|
| `000_SchemaMigrations.sql` | Migration ledger (FR-251) |
| `001_Customers.sql` | Customers + upgrade cache (FR-196) |
| `002_Widgets.sql` | Widgets registry (FR-232) |
| `003_PartFeedKeys.sql` | PartFeedKeys (from maintainer/sql) |
| `004_Parts.sql` | Parts |
| `005_PartsStaging.sql` | PartsStaging |
| `006_MergeParts.sql` | `CREATE OR ALTER PROCEDURE dbo.MergeParts` (FR #4518; was bare MERGE) |
| `007_DeleteMissingParts.sql` | `CREATE OR ALTER PROCEDURE dbo.DeleteMissingParts` (FR #4518; was bare UPDATE) |
| `008_ImpactPendingOnboard.sql` | Impact onboarding queue |
| `010_Shops.sql` | Merchant Shops (FR-216 / FR-235) |
| `011_ShopStatusLog.sql` | Shop status log (FR-235) |
| `012_PartFeedKeys_shop_kind.sql` | PartFeedKeys shop/kind |
| `013_RevenueShare.sql` | Club revenue share (FR-249) |
| `014_mdb_identity_views.sql` | `mdb.*` live views / sandbox tables (FR-251) |
| `015_AmazonTrackingIds.sql` | Amazon per-tenant partner tags (FR-248 / #1362) |
| `016_WidgetStats.sql` | WidgetStatsDaily + WidgetEventDedupe (FR-234 / #1348) |
| `017_ShopInvoices_StripeEvents.sql` | ShopInvoices + StripeEvents idempotency (FR-239 / #1353) |
| `018_Merchants_OtpCodes.sql` | Merchants verified contact + OtpCodes hashed secrets (FR-228); never SystemOTPs |
| `019_Parts_ImportColumns.sql` | Parts PartId/UX + Brand/Category/GTIN/LinkData (FR #4463) |
| `020_Parts_FullText.sql` | FULLTEXT catalog + index on Parts (FR #4463) |
| `021_ImportCatalog.sql` | ImportProviders / ImportFeeds (FR #4463) |
| `022_IngestSchema.sql` | ingest.* runs/files/staging/rejects/failures/purge + RCSI (FR #4463) |

Every file starts with `-- target: a_search`.
