# Daily report signup contract (FR-052a)

Onboarding agents emit **signup rows** that feed the daily merchant report
currently produced by madeira-awin-clubscan. This doc maps clubscan report
**sections** to a-search field names. Writer persistence is FR-052b (OOS here).

## Legacy clubscan (read-only)

- Tree: https://github.com/SimonBarnett/AWS/tree/main/Lambdas/madeira-awin-clubscan
- Onboarding + email report:
  https://github.com/SimonBarnett/AWS/blob/main/Lambdas/madeira-awin-clubscan/routes/onboarding.js

Clubscan builds HTML email with (at least):

1. **New merchants table** — merchants onboarded in this run
2. **Totals** — projected total merchants / products for the source
3. **Last 24h sales** — transaction pointer table (sales data, not signup rows)
4. Optional top-merchants-by-parts (catalogue stats; not signup emit)

a-search must document and emit the **signup feed** for (1). Totals and
last-24h sales stay pointers for the report job (may remain external until
cutover). Pixel-perfect HTML email is **out of scope**.

## Clubscan → a-search field map

### New merchants table (signup emitters)

Clubscan `newAdvertisers[]` push shape vs a-search `emitSignupRow` /
`docs/onboarding-agents.md` minimum:

| Clubscan report / object | a-search signup field | Notes |
|--------------------------|----------------------|--------|
| `company_name` (table “Company”) | `company_name` **or** `merchantName` | Display name; emitters use `company_name` |
| `description` (table “Description”) | `description` | Optional; truncated in clubscan HTML |
| `email` (table “Email” / login link) | `email` | Required on emitSignupRow |
| `user_id` | `user_id` | Clubscan merchant user id |
| `advertiserId` / programme `id` | `advertiserId` **or** `merchantId` | Provider merchant id |
| `website` | `website` | Optional; logo link href |
| `logoUrl` | `logoUrl` | Optional; company column image |
| `primarySector` | `primarySector` | Optional; under logo in clubscan |
| *(run clock)* | `onboardedAt` **or** `signedUpAt` | ISO-8601 when join recorded |
| Awin-only in clubscan | `source` | a-search: registry id (`awin`, `impact`, …) |
| live/sandbox isolation | `env` | `live` \| `sandbox` |
| join outcome | `status` | e.g. `joined`, `pending`, `rejected` |

**Required emit keys** (Awin FR-050c / Impact FR-051c subset):

`user_id`, `company_name`, `email`, `advertiserId`, `env`

Aliases accepted by report readers (`listSignupEvents` / FR-052c):

| Canonical emit | Onboarding-agents alias |
|----------------|-------------------------|
| `advertiserId` | `merchantId` |
| `company_name` | `merchantName` |
| `onboardedAt` | `signedUpAt` |

### Totals (report job pointer — not signup emit)

| Clubscan | a-search report job |
|----------|---------------------|
| `stats.totalAwinMerchants` + new count → “Total Awin Merchants” | Per-`source` merchant count from Parts / onboard store (UNKNOWN until FR-052c+) |
| `stats.totalAwinParts` → “Total Awin Products” | Parts count `Source=@source` (maintainer/Parts) |

Signup emitters do **not** invent totals; the report job aggregates.

### Last 24h sales (report job pointer — not signup emit)

| Clubscan | a-search |
|----------|----------|
| `getLast24hAwinSales` table | Sales/performance feed (FR-053/054 family); signup doc only **points** here |

Do not put sale rows into `signups[]`.

## Emitters (producers)

| Source | Module (when merged) |
|--------|----------------------|
| `awin` | `providers/local/awin/onboarding/src/emitSignupRow.js` |
| `impact` | `providers/local/impact/onboarding/src/emitSignupRow.js` |

Drain accumulates `runOnce(…).signups` for the daily feed
(`docs/onboarding-agents.md`).

## Persist path (LOCKED — FR-052b)

**Store: S3 JSON** (not MSSQL).

- Key: `{env}/_reports/{source}/{yyyy-MM-dd}/signups.json`
- Bucket: `S3_RESULTS_BUCKET` (same results bucket as search writes)
- Body: `{ env, source, day, signups: Signup[] }`
- Module: `shared/onboarding/writeSignups.js`
  (`writeSignupEvents` / `readSignupEvents`, injectable `putObject`/`getObject`)
- Each signup gets stable `id` (`sig_…`) plus Awin-schema fields and
  onboarding-agents aliases (`merchantId`, `merchantName`, `signedUpAt`)

Writer merges by `id` into the day's object.

### Reader (FR-052c)

- Module: `shared/onboarding/readSignups.js` → `listSignupEvents({ env, source, day })`
- Returns only rows matching **env** / **source** / **day** (UTC date of
  `onboardedAt` / `signedUpAt`); foreign rows in a dirty object are dropped.
- Mailer / HTML email remains out of scope.

## Related

- Parent: `docs/fr/FR-052.md`
- Drain contract: `docs/onboarding-agents.md`
- Phase-1b Q5: `docs/feature-request-phase1b-2026-10-07.md`
