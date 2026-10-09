# Feature request: a-search Phase 3 â€” unlock deploy unknowns + parked drains

**Repo:** SimonBarnett/a-search (existing â€” do **not** `gh repo create`)  
**Date:** 2026-10-09  
**Plan:** `bob/plan/work/plan-20261009-065037`  
**Compared to:** `origin/main` @ `0342707` (detached worktree)

## Context

Phase-2 stay-dark provider work (#614â€“#665) is **CLOSED** on main. Open issue count is **0**.  
Vision Success S1â€“S20 how-measured paths are present. Remaining gaps are **ops locks**, **parked drains**, and **per-account enable** â€” not stub rewrites.

## Ultimate objective (this wave)

Operators can run sandbox searches against a decided MSSQL isolation model, with JWT/rclone/S3 unknowns LOCKED for deploy, Awin onboarding able to drain live HTTP with fixtures, and each dark provider flippable via its own enable FR when credentials exist.

## Shape

**service** (unchanged â€” reuse repo shape).

## Success (wave)

| id | metric | target | how measured | fail-when |
|----|--------|--------|--------------|-----------|
| P3-S1 | Sandbox MSSQL decided | **LOCKED:** separate database on the same instance (live=`madeiradb`) in `docs/environments.md` + pin test | `tests/fr121-sandbox-mssql-decision.test.js` (draft) | Sandbox still UNKNOWN with no chosen option |
| P3-S2 | AWSâ†’IONOS path documented | Network path + least-privilege login knobs LOCKED or explicit UNKNOWN with owner | `docs/environments.md` needles + pin | Invented hostnames/secrets in git |
| P3-S3 | JWT deploy knobs | `JWT_ISSUER` / `JWT_AUDIENCE` / JWKS-or-secret documented as LOCKED placeholders + how to set at deploy | `docs/endpoint-search.md` + pin | Hardcoded production issuer secrets in repo |
| P3-S4 | rclone + S3 scheme | Drive letter/mount unit + one-bucket-vs-two decided (or LOCKED default restated with IaC pointer) | `docs/rclone-results.md` / environments + pin | Conflicting bucket schemes in IaC vs docs |
| P3-S5 | Awin live onboarding drain | Live path no longer empty; fixture-backed HTTP drain with exit when `remaining=0` | `tests/fr12x-awin-onboarding-live-drain.test.js` | Live path still no-op comment only |
| P3-S6 | Enable path | Template + first enable FR pattern: one provider, flip `enabled`, pin stay-others-dark | `docs/phase3-enable-provider.md` + one enable FR | Bulk enabling all Phase-2 ids in one PR |

## Out of scope (this umbrella)

- Re-implementing Phase-2 search/normalize/worker modules already on main
- Live AWS cutover / account IDs (still vision UNKNOWN)
- Amazon Creators API (separate parked FR)
- Stamping UAT

## Small FR index (drafts)

| Code | Goal (one line) |
|------|-----------------|
| FR-121 | Lock sandbox MSSQL isolation decision in docs + pin |
| FR-122 | Document AWSâ†’IONOS SQL network path decision surface |
| FR-123 | Lock JWT issuer/audience/JWKS deploy documentation |
| FR-124 | Lock rclone mount letter + S3 bucket scheme |
| FR-125 | Awin onboarding live HTTP drain (fixture-backed) |
| FR-126 | Phase-3 enable-provider docs + pin template |
| FR-127 | Close/abandon stale draft harvest PRs #613/#726 (hygiene) |

Anti-omnibus: **file one GitHub issue at a time** after operator picks a slice. Prefer Goal / Deliverables / Testable bodies. Park docs with **Refs**, not Closes, for implementation issues.
