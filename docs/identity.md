# Identity: user, partner, club codes (FR-114)

Club Madeira `madeiradb` identifies people, merchants, clubs (communities) and
partners with a shared **8-character code**. a-search must use the same shape
everywhere it accepts or emits a tenant / `user_id` / JWT `userId`.

**As of:** 2026-10-08 read-only inventory (see also [data-model.md](data-model.md)).

## Code format

| Rule | Value |
|------|-------|
| Canonical column | `dbo.Users.user_id` `varchar(8) NOT NULL` (PK) |
| Length | exactly **8** |
| Charset | `[0-9A-Z]` only (uppercase) |
| Regex | `^[0-9A-Z]{8}$` |
| Minting | `dbo.GenerateUniqueUserId` — 7 random chars from `[0-9A-Z]` plus 1 checksum char, uniqueness checked against `Users` |
| Shared helper | `shared/identity/userId.js` (`isValidUserId`, `assertUserId`) |

Examples from live data (no PII): `L7WDZWC8`, `GV2K0K7O`. Docs and fixtures
may use synthetic codes such as `ABC12345` / `TESTUSR1`.

**Checksum algorithm** of `GenerateUniqueUserId` is not re-implemented in
a-search. Production onboarding must inject a generator that calls that proc
(or an equivalent that returns a unique `^[0-9A-Z]{8}$` code). Unit tests inject
fixed fixture codes.

## Where the code lives (table / column / type)

Dotted names for agents/pins: Users.user_id, Catalog.UserId, Products.UserId, MerchantProducts.UserId, RejectedAsins.UserId, DatabaseCallLog.UserId, UserCategories.uid, UserApiKeys.user_id, UserFingerprints.user_id, SystemOTPs.user_id, Partner.PartnerID, clubscan.PartnerId, clubscan.ClubID, AwinHighApprovalMerchants.PartnerID, AwinHighApprovalMerchants.ClubID.


| Table | Column | Type (inventory) | Role of the code |
|-------|--------|------------------|------------------|
| Users | `user_id` | varchar(8) PK | Canonical identity |
| Catalog | `UserId` | nvarchar(50/100) | Owner user (logical, no FK) |
| Products | `UserId` | nvarchar(50/100) | Owner user (logical, no FK) |
| MerchantProducts | `UserId` | nvarchar(50/100) | Owner user (logical, no FK) |
| RejectedAsins | `UserId` | nvarchar(50/100) | Owner user (logical, no FK) |
| DatabaseCallLog | `UserId` | nvarchar(50/100) | Actor user (logical, no FK) |
| UserCategories | `uid` | nvarchar(50) | Owner user (logical, no FK) |
| UserApiKeys | `user_id` | varchar(8) | FK -> `Users.user_id` |
| UserFingerprints | `user_id` | varchar(8) | Owner user (logical, no FK) |
| SystemOTPs | `user_id` | char(8) | Owner user (logical, no FK) |
| Partner | `PartnerID` | char(8) | Partner identity |
| clubscan | `PartnerId` | varchar(8) | Owning partner |
| clubscan | `ClubID` | varchar(8) | Club = community user code |
| AwinHighApprovalMerchants | `PartnerID` | nvarchar(8) | Partner code |
| AwinHighApprovalMerchants | `ClubID` | varchar(8) | Club code |

Almost all of these joins are **logical (no FK)** — see FR-117 / data-model.
Only `UserApiKeys.user_id` is a declared FK to `Users`.

## Roles vs permissions vs Partner table (open question)

`Users.role` counts (as of 2026-10-08): merchant 244, community 14, partner 1,
NULL 1. `Users.permissions` is a JSON-ish array string (e.g. values containing
`partner` or `admin`).

A **partner** appears in three places that **disagree**:

| Source | Example code | Notes |
|--------|--------------|-------|
| `Partner` table | `L7WDZWC8` (Approved=1) | 1 row |
| `Users.role = 'partner'` | `GV2K0K7O` | Not present in `Partner` |
| `permissions LIKE '%partner%'` | `L7WDZWC8` (role NULL), `GV2K0K7O`, plus two `role=community` users | Overlaps both |

**Open question (needs Simon):** which of `Partner`, `Users.role`, or
`permissions` is authoritative for "is this code a partner?" **a-search must
not treat any single one as authoritative until that decision.** Do not write
product logic that assumes they agree.

## Referrer = partner relationship (inferred)

17 users have `Users.referrer` set; all point at `L7WDZWC8`. `L7WDZWC8` refers
itself. No dangling referrers in the snapshot.

`dbo.PartnerSites(@referrer)` and `dbo.TrafficAv(@referrer)` count a partner's
sites through `Users.referrer` plus `permissions` containing `community` /
`merchant`. **Inferred:** the partners API (`…/prod/token/network?type=partners`)
reads this model. a-search does not call that API today. Treat
"referrer = owning partner" as **inferred pending Simon confirmation**.

## Club = community user

A **club** is a community user. In `clubscan`, `ClubID` is the club's user code
and `PartnerId` is the owning partner. Snapshot: all 10 `ClubID` values exist
in `Users`; 9 rows have `PartnerId = L7WDZWC8`; 1 (`ClubID = L7WDZWC8`) has
`PartnerId` NULL.

`dbo.clubs()` is an inline TVF over `clubscan` + `Partner` (not a table). It
only returns clubs whose `JsonResult` has `$.name` (6 of 10 in the snapshot),
and only joins Partner details when `Partner.Approved = 1`.

## a-search rules

1. **JWT `userId`** must be a `Users.user_id` code (`^[0-9A-Z]{8}$`). Entry auth
   (`entry/src/auth/jwt.js`) rejects other shapes.
2. **Onboarding** (`createMerchantUser`, Impact signup emit) must not mint
   `usr_…` or other non-codes. Callers inject `newUserId` that returns a valid
   code (prefer `dbo.GenerateUniqueUserId` in live SQL).
3. **Signup rows** validate `user_id` with the same helper before emit.
4. No PII (names, emails of real people) in this doc or in identity fixtures —
   use `@….invalid` addresses in tests.

## Related

- [data-model.md](data-model.md) — dbo inventory + ERD
- [daily-report-signups.md](daily-report-signups.md) — signup field map (`user_id`)
- [endpoint-search.md](endpoint-search.md) — JWT tenant in search accept
