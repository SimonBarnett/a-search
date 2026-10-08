# a-search gap analysis (origin/main @ 27e17d2)

Date: 2026-10-08  
Plan: `work/plan-20261008-095625`  
Method: fetch `origin/main` into detached worktree (local `C:\ai\a-search` was dirty on `fr-96`).

## Queue state

| Check | Result |
|-------|--------|
| Open GitHub issues | **0** |
| Vision Success S1–S20 how-measured paths | **All present** |
| `tests/**/*.test.js` count | 221 |
| Shape | **service** LOCKED |

Phase 0 / 1 / 1b pin evidence is on main. Next work is **Phase 2: finish stub providers while staying dark**.

## Provider matrix

### Live — implemented (search + normalize + worker; enabled true)

| id | search | normalize | worker stub? | selftestProbe | onboarding skill |
|----|--------|-----------|--------------|---------------|------------------|
| amazon | yes | yes | no | yes | yes |
| ebay | yes | yes | no | yes | yes |
| rakuten | yes | yes | no | yes | (per FR-060) |
| cj | yes | yes | no | yes | (per FR-060) |

### Live — stub only (enabled **false**) — Phase 2

| id | worker | gap |
|----|--------|-----|
| kelkoo | stub “not wired yet” | search, normalize, worker, selftestProbe, rateLimit, **onboarding skill missing** |
| skimlinks | stub | same |
| aliexpress | stub | same |
| etsy | stub | same |
| bol | stub | same |

### Local — implemented (enabled true)

| id | queryParts | worker | onboarding/ |
|----|------------|--------|-------------|
| awin | yes | real | yes (live HTTP drain still empty comment in run.js) |
| impact | yes | real | yes |

### Local — stub only (enabled **false**) — Phase 2

| id | class | gap |
|----|-------|-----|
| partnerize, webgains, tradedoubler, admitad, flexoffers, avantlink | feed → MSSQL | queryParts, worker, selftestProbe, rateLimit, feed-parser hook |
| shopify, wix, woocommerce | merchant Admin/REST → Parts | catalog client, normalize/upsert, worker, selftestProbe, rateLimit (scaffold landed via #607) |

## Operator lock for this plan

> Develop **ALL** providers. Do **not** set them live until we have account details.

Interpretation (LOCKED for Phase-2 drafting):

1. Replace every stub with fixture-backed real modules (tests never need live accounts).
2. Keep `providers/registry.json` `enabled.live` and `enabled.sandbox` **false** for every Phase-2 id until a later explicit enable FR per account.
3. Prefer many small Goal / Deliverables / Testable FRs (one PR per issue).

## Out of this Phase-2 slice (parked)

- Amazon Creators API follow-up (shortlist FR-045 note)
- Awin onboarding live HTTP drain (comment in `providers/local/awin/onboarding/src/run.js`)
- Vision UNKNOWN lock (JWT issuer, rclone letter, bucket vs prefix, MSSQL names)
- Flipping any `enabled` flag to true

## Draft backlog

See `docs/fr/FR-061.md` … `FR-112.md` and `FR-PHASE2-INDEX.csv` (52 small FRs).  
Umbrella brief: `docs/feature-request-phase2-all-providers-2026-10-08.md`.

GitHub filing: **drafts only** until operator says file (anti-omnibus).
