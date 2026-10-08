# madeiradb data model (dbo)

Verified facts about Club Madeira **`madeiradb`** on IONOS. Full table
inventory / ERD: FR-113 (may land as expansions of this file). Identity codes:
FR-114. Catalog / ASIN map: FR-115.

**As of:** 2026-10-08 read-only inventory unless noted.

## Club scans

### Two different "clubscan" things

| Name | What it is | a-search use |
|------|------------|--------------|
| **madeira-awin-clubscan** | Legacy AWS Lambda (Awin onboarding + daily HTML report) | Signup field map in [daily-report-signups.md](daily-report-signups.md); onboarding drain parity in [onboarding-agents.md](onboarding-agents.md) |
| **`dbo.clubscan`** | SQL table of **club website scans** | Club context / active clubs; **not** the signup report store |

**madeira-awin-clubscan (Lambda) ≠ `dbo.clubscan` (table).** Do not map signup
rows onto `dbo.clubscan`.

### `dbo.clubscan` columns (10 rows as of 2026-10-08)

All rows `Status='completed'` with `JsonResult`. Last `UpdatedAt`: 2026-10-05 17:03.

| Column | Type / notes |
|--------|----------------|
| `Id` | `int IDENTITY` PK |
| `Url` | `nvarchar(500) NOT NULL`, **UNIQUE** |
| `Status` | default `'pending'` |
| `JsonResult` | `nvarchar(max)` — scan payload |
| `PartnerId` | `varchar(8)` — owning partner code (logical, **no FK**) |
| `ClubID` | `varchar(8)` — club = community user code (logical, **no FK**) |
| `LastError` | error text |
| `PartnerURL` | `nvarchar(1000) NOT NULL`, default `https://partner.clubmadeira.io/` |
| `Screenshot`, `Comment` | optional |
| `CreatedAt`, `UpdatedAt` | timestamps |
| `active` | **computed** `bit` = `dbo.fn_ClubScanIsActive(Id)` |

`active` is 1 when the club's fingerprints (`UserFingerprints.user_id = ClubID`
→ `FingerprintCatalogAccess`) show activity within the last **72 hours**.
Snapshot: 4 of 10 active.

No FK from `PartnerId` / `ClubID` to `Users` or `Partner`. Snapshot: every
`ClubID` exists in `Users`; `PartnerId` is `L7WDZWC8` on 9 rows and NULL on 1.

If a-search writes club context, it must write `ClubID` / `PartnerId` as
**8-char codes** (`^[0-9A-Z]{8}$`) that exist in `Users` (see FR-114).

### JSON keys read by `dbo.clubs()`

Inline TVF over `clubscan` + `Partner` (not a base table). Keys:

- `$.name`, `$.location`, `$.sector`, `$.review`, `$.audience`
- `$.marketSegments[].segmentName` / `description`

`clubs()` only returns clubs whose `JsonResult` has `$.name` (6 of 10 in the
snapshot), and only joins Partner details when `Partner.Approved = 1`.

### Related view

`vw_ActiveClubs_Last72Hours` joins `DatabaseCallLog.UserId = clubscan.ClubID`.

### Awin advertiser onboarding DB home (inferred)

Legacy Lambda signup / onboarding **fields** align with
**`dbo.AwinHighApprovalMerchants`** (inferred from columns — **confirm with
Simon** before treating as authoritative):

| Fact | Value |
|------|-------|
| Rows | 1,480; PK `MerchantId int` (Awin advertiser id) |
| Columns | `Name`, `Email`, `Website`, `logoUrl`, `primarySector`, `description`, `Joined bit`, `AwinUserId`, `PartnerID nvarchar(8)`, `ClubID varchar(8)` |
| PartnerID set | 74 rows (68 × `L7WDZWC8`, 6 × `2889699`) |
| ClubID set | 64 rows |

**Known data-quality issue:** `PartnerID = 2889699` is **not** an 8-char
`Users.user_id` code. **a-search must not copy it** into `PartnerId` /
`user_id` / JWT tenant fields. Prefer valid `^[0-9A-Z]{8}$` codes only.

`AwinRecommendedMerchants` (639 rows) logs recommendations; separate from
high-approval merchants.

Field-level map for signup emitters:
[daily-report-signups.md](daily-report-signups.md).
