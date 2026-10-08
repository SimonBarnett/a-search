# Partner / club / user removal cascade (FR-118)

Observed contract from the **2026-10-05 Greenfield removal** (`gf_bak` backups +
current `dbo` state, inventory **2026-10-08**). Partner code `MWRJCP92`
(`Users.role='partner'`, `Partner` row, referrer parent `L7WDZWC8`) and club
user `MV69J0VA` were removed.

**CAST IRON:** executing deletes/reassigns in madeiradb is a **DBA** action, not
an a-search runtime feature. a-search owns S3 / rclone artifact cleanup and
must fail closed on JWTs whose `userId` is no longer in `Users` (see FR-117
orphan-safe reads).

## Observed rule (inferred)

1. Back up affected rows to `gf_bak` first (`*_20261005` / `*_MV69J0VA_20261005`).
2. **Delete** the partner's own user-scoped data and any **club the partner owns**
   outright.
3. **Reassign** surviving clubs and referred users to the parent partner
   (`L7WDZWC8`) in `Users.referrer` and `clubscan.PartnerId`.
4. Do **not** re-key club `userId` / `ClubID` values that survive -- only
   `PartnerId` / `referrer` move.

## Table actions (delete / reassign / backup only / out of scope)

Order of work (child data first -> Catalog -> clubscan -> Users -> Partner):

| Table | Action | Notes (Greenfield 2026-10-05) |
|-------|--------|-------------------------------|
| Products | **delete** | UserId MWRJCP92 / MV69J0VA; 14,431 + 14,965 backed up; none remain |
| RejectedAsins | **delete** | 221,514 + 45,504 backed up |
| Catalog | **delete** | 37 + 100 backed up |
| CatalogAffiliateUpdates | **delete** | 111 + 300; **FK cascade** from Catalog |
| MerchantProducts | **delete** | 67 for MWRJCP92; 0 for club |
| UserCategories | **delete** | 1 + 1 |
| UserApiKeys | **delete** | 1 each |
| UserFingerprints | **delete** | 1 each |
| SystemOTPs | **delete** | 1 each |
| MerchantCatalog | **delete** | 1 each |
| DatabaseCallLog | **delete** | 999 for partner; 0 club; no rows remain for those codes |
| PostHogEvents | **backup only** / removal assumed | 54 backed up; no user-code column to verify |
| FingerprintCatalogAccess | **backup only** / removal assumed | 7 backed up; no user-code column to verify |
| clubscan | **delete** + **reassign** | Id 8 (ClubID MWRJCP92) + Id 19 (ClubID MV69J0VA) **deleted**; Ids 7 and 13 **reassigned** PartnerId MWRJCP92 -> L7WDZWC8; Id 12 already L7WDZWC8 (backup only) |
| Users | **delete** + **reassign** | MWRJCP92 + MV69J0VA **deleted**; 81W119S8, C7Y1617W, T4WGUDXD **kept**, referrer MWRJCP92 -> L7WDZWC8 |
| Partner | **delete** | Partner row for MWRJCP92 |
| AwinHighApprovalMerchants | **out of scope** / unknown | No `gf_bak` table; PartnerID/ClubID columns exist -- DBA must decide |
| AwinTransactions | **out of scope** / unknown | No backup tables observed |
| Commissions | **out of scope** / unknown | No backup tables observed |
| Payments | **out of scope** / unknown | No backup tables observed |

### Suggested DBA order

1. Backup to `gf_bak` (or site backup policy).
2. Delete child product/reject/catalog data for codes being removed.
3. Delete Catalog rows (CatalogAffiliateUpdates cascades).
4. clubscan: delete owned club rows; **reassign** PartnerId on survivors.
5. Users: **reassign** referrer on survivors; **delete** removed partner/club users.
6. Delete `Partner` row for the partner code.
7. Manually review Awin* / Commissions / Payments (out of scope above).

## a-search side (artifacts + JWT)

Removed codes must disappear from object storage and signup feeds. Surviving
reassigned clubs keep the same `userId` / `ClubID` -- **re-key nothing** for them.

| Artifact | Prefix / key | Action for **removed** codes |
|----------|--------------|------------------------------|
| Search results | `{env}/{source}/{userId}/...` | delete or archive |
| Mapping | `{env}/_mapping/{userId}/...` | delete or archive |
| Daily signup reports | `{env}/_reports/{source}/{day}/signups.json` | strip signup rows whose `user_id` is removed (or archive day files that only contain that tenant) |
| JWT accept | entry auth | stop accepting JWTs whose `userId` is absent from `Users` (FR-117 `resolveTenantUser` / empty reads) |

Reassigned clubs: `userId` unchanged; only DB `PartnerId` / `referrer` moved --
leave S3 prefixes for those codes in place.

### S3 / rclone runbook (dry-run first)

Use `scripts/Remove-ASearchUserArtifacts.ps1`:

```powershell
# List keys only (default)
.\scripts\Remove-ASearchUserArtifacts.ps1 -UserId MWRJCP92 -Env live -DryRun

# Both envs
.\scripts\Remove-ASearchUserArtifacts.ps1 -UserId MWRJCP92 -Env all -DryRun

# After review: actually delete listed keys
.\scripts\Remove-ASearchUserArtifacts.ps1 -UserId MWRJCP92 -Env live -ConfirmDelete
```

Prefixes scanned per env (`live` / `sandbox`):

- Results: `{env}/` ... `/{userId}/` under each source segment (list by
  `{env}/_mapping/{userId}/` and by matching `/{userId}/` under `{env}/` excluding
  `_mapping` / `_reports` / `_staging` when using the script helpers).
- Mapping: `{env}/_mapping/{userId}/`
- Reports: script lists `{env}/_reports/` day files and reports signup rows
  matching `user_id` (rewrite/archive is a follow-up ops step; dry-run prints
  matches).

Requires AWS credentials / profile that can `ListObjectsV2` (+ `DeleteObject`
only with `-ConfirmDelete`). Prefer rclone list on `A_SEARCH_RCLONE_ROOT` when
working from the SQL host -- same key layout ([rclone-results.md](rclone-results.md)).

## Pre-removal impact query

Read-only counts for a candidate code: `scripts/partner-removal-impact.sql`.
Pass `@Code` (varchar(8)). **SELECT only** -- no data changes.

## Related

- [s3-mapping.md](s3-mapping.md) -- `_mapping` layout
- [rclone-results.md](rclone-results.md) -- results key layout
- [daily-report-signups.md](daily-report-signups.md) -- signup / `_reports`
- FR-113 `docs/data-model.md` (issue #730) -- madeiradb inventory
- FR-114 identity / 8-char codes (issue #731)
- FR-117 orphan-safe JWT / Users gate (issue #734) -- stop accepting JWTs for absent `Users`
