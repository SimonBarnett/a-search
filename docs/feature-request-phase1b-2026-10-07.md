# Feature request wave: a-search Phase 1b (ops agents + performance)

**Target repo:** `SimonBarnett/a-search` (existing — do **not** `gh repo create`)
**Shape:** reuse LOCKED **service** from `docs/vision.md`
**Plan session:** `plan-20261007-142747`
**Status:** DRAFT for filing — human brief 2026-10-07

## Objective

Every a-search agent CWD carries CAST IRON harvest via the bobiverse intake
webhook; shared code lives in one shared layer; deterministic failures auto-file
to a-search intake; each **local** provider has a scheduled onboarding agent that
drains until done and feeds the daily signup report (clubscan parity); callers
get a second JWT endpoint for clicks/visits/sales performance plus a service that
persists the local↔S3 mapping.

## Success

| id | metric | target | how measured | fail-when |
|----|--------|--------|--------------|-----------|
| Q1 | Harvest CAST IRON in every agent CWD | Every `AGENTS.md` + `a-search-*` SKILL.md contains the CAST IRON harvest block and intake `POST /bob/v1/intake` with explicit `-Repo` | `tests/skillbook-harvest.test.js` counts folders vs needles | Any integration folder missing the block |
| Q2 | Shared layer only for shared code | `resultsPath`, `writeResults`, `assertEnv`, intake reporter, product normalize live under `shared/` (or Lambda layer `/opt/nodejs/a-search`); providers do not copy-paste | layout + import pin tests | Duplicate shared helpers reappear under providers/*/src |
| Q3 | Deterministic exceptions → a-search intake | Uncaught/handled fatal errors in entry/worker/maintainer/onboarding call intake helper with `repo=SimonBarnett/a-search` (deduped) | unit test with mock intake POST | Fatal path logs only and never POSTs intake |
| Q4 | Local onboarding agents | Each enabled local source has `onboarding/` agent CWD + scheduled runner that processes until empty then exits | layout test + schedule handler test `remaining=0` exit | No onboarding folder for awin/impact or runner loops forever with no exit |
| Q5 | Daily report signup feed | Onboarding emits signup rows compatible with clubscan daily report fields (new merchants, counts) documented vs madeira-awin-clubscan | contract test + docs link | Signup payload undocumented or missing new-advertiser rows |
| Q6 | Performance endpoint | JWT `GET` (or POST) account performance returns clicks/visits/sales for that `userId` | `tests/performance-endpoint.test.js` | Endpoint missing or ignores JWT userId |
| Q7 | Persist local S3 mapping | Service upserts mapping records (token/link → S3 key / click path) readable by performance endpoint | unit test round-trip | Mapping only in memory / lost across invokes |

## Shape

Primary: **service** (unchanged). Add HTTP surface for performance. HTML mocks:
extend or add `docs/mocks/performance.html` when UI wireframe needed; API-first OK
with JSON fixture docs if no browser UI this wave.

## Legacy reference (read-only)

Daily Awin onboarding + report:
`https://github.com/SimonBarnett/AWS/tree/main/Lambdas/madeira-awin-clubscan`
(especially `routes/onboarding.js`, EventBridge `Awin-Onboarding`).

## Intake rule (LOCKED)

- Agents always file through the **bobiverse intake webhook**
  `POST https://irc.ntsa.uk/bob/v1/intake` (helper
  `Report-BobiverseIntakeIssue.ps1`).
- Product issues/FRs/skills for this repo: `-Repo SimonBarnett/a-search`.
- Runtime exceptions in deterministic a-search code: same webhook with
  `repo=SimonBarnett/a-search` (never swallow without filing).
- Never put secrets in intake bodies.

## Proposed FRs

FR-046 … FR-056 in `docs/fr/` — Goal / Deliverables / Testable; one PR per issue.
