# a-search gap analysis (origin/main @ 0342707)

Date: 2026-10-09  
Plan: `work/plan-20261009-065037`  
Method: `git fetch` + detached worktree `plan/work/plan-20261009-065037/repo` from `origin/main` (local `C:\ai\a-search` was dirty on `main`, behind by ~720 commits, dirty `package.json` / `package-lock.json` — did not ff-pull).

## Queue state

| Check | Result |
|-------|--------|
| Open GitHub issues (at gap snapshot @ 0342707) | **0** |
| Phase-3 implementation issues (filed after park) | **#950-#956 open** (FR-121..127); twin #957 closed Duplicate of #950 |
| Phase-2 issues #614-#665 | **52/52 CLOSED** |
| Schema/docs FR-113..FR-120 | **CLOSED** (merged product + docs/mrb) |
| Vision Success S1-S20 how-measured core tests | **All present** (344 `*.test.js` on main) |
| Shape | **service** LOCKED |
| Open PRs (hygiene) | Draft harvest leftovers `#613`, `#726` (FR-127); park PR #958; FR-122 tip #960 |

Phase 0 / 1 / 1b / **2 (stay-dark providers)** pin evidence is on main.  
Next work is **Phase 3: unlock deploy unknowns + parked drains + per-account enable**.

## Provider matrix (current main)

### Live — enabled true (search + normalize + worker + selftest + onboarding skill)

| id | notes |
|----|-------|
| amazon, ebay, rakuten, cj | Production-path providers |

### Live — stay-dark (enabled false) — Phase-2 modules landed

| id | modules on main | gap now |
|----|-----------------|---------|
| kelkoo, skimlinks, aliexpress, etsy, bol | search, normalize, worker, selftestProbe, onboarding skill | **No code stub gap.** Need account credentials + explicit **enable FR** before `enabled=true` |

### Local — enabled true

| id | notes |
|----|-------|
| awin, impact | Real queryParts + workers; onboarding folders exist |

### Local — stay-dark (enabled false) — Phase-2 modules landed

| id | class | modules on main | gap now |
|----|-------|-----------------|---------|
| partnerize, webgains, tradedoubler, admitad, flexoffers, avantlink | feed → MSSQL | queryParts, worker, selftestProbe, parseFeed | **Enable FR** when feed credentials exist |
| shopify, wix, woocommerce | merchant Admin/REST → Parts | catalog, normalize, upsert, queryParts, worker, selftestProbe | **Enable FR** when shop credentials exist |

Stay-dark rule from FR-061 / `docs/phase2-providers.md` remains LOCKED until an explicit per-provider enable FR.

## Vision Success vs tree

| Success | Status on 0342707 |
|---------|-------------------|
| S1–S20 how-measured needles | Present (core tests + FR pin suite) |
| S6 sandbox SQL isolation | **Partial** — queues/paths isolated in code; **sandbox MSSQL target still UNKNOWN** (`docs/environments.md`) |
| S7 maintainer cadence defaults | Proposal only (UNKNOWN in vision) |
| S8–S10 skillbooks / harvest | Present |
| S13 awin onboarding live HTTP drain | **Parked** — `providers/local/awin/onboarding/src/run.js` still comments empty live drain |

## Operator-facing gaps (Phase 3 candidates)

These need human decisions or account details; they are **not** re-opens of Phase-2 stub work.

1. **Sandbox MSSQL isolation** — choose: separate DB / schema in madeiradb / read-only live (environments.md).
2. **AWS → IONOS SQL network path** — egress IP / firewall / VPN (UNKNOWN).
3. **JWT issuer / audience / JWKS** — lock deploy values (or document fixture-only until login product exists).
4. **rclone drive letter + mount unit** on SQL host.
5. **S3 one-bucket prefixes vs two buckets** — pick one in IaC.
6. **Awin onboarding live HTTP drain** — replace empty live path with fixture-backed client (sandbox path may already exist).
7. **Per-provider enable FRs** — one small FR per source when credentials arrive (flip `enabled` + pin test; never bulk-enable).
8. **Amazon Creators API follow-up** — still parked from Phase-2 umbrella (PA-API path remains).
9. **Draft harvest PR hygiene** — close or revive open drafts `#613`, `#726`.

## Out of this Plan seat (unless operator asks)

- Filing all Phase-3 FRs in one turn (anti-omnibus: draft first, file one slice at a time after approval).
- Builds, IRC, UAT, flipping any `enabled` flag without a dedicated FR.
- ff-pull over dirty `C:\ai\a-search`.

## Draft backlog

See `docs/feature-request-phase3-unlock-2026-10-09.md` and `docs/fr/FR-121.md` … (small Goal/Deliverables/Testable drafts).  
**GitHub filing:** implementation issues **#950-#956** are filed; park docs use **Refs** (not Closes). FR-121 operator lock (separate DB on same instance) is recorded in `docs/fr/FR-121.md`; `docs/environments.md` sandbox UNKNOWN remains until the FR-121 implement PR.
