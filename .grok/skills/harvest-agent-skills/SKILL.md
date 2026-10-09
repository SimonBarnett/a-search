---
name: harvest-agent-skills
description: >
  FOUNDATION: harvest a-search playbooks back as PRs to SimonBarnett/a-search.
  Use when harvest skills, honesty box, CAST IRON harvest, or /harvest-agent-skills.
  Prefer deterministic scripts over LLM reasoning. Does not dispatch product builds.
github: https://github.com/SimonBarnett/a-search
---

# harvest-agent-skills (a-search)

> **CAST IRON RULE - HARVEST AND FILE EVERYTHING (read this first, every time).**
> 1. ALWAYS harvest skills you learn and file EVERY issue / FR / bug / gap you find in the
>    SAME turn. Never leave a finding unfiled, never "note it for later".
> 2. File via intake with explicit `-Repo SimonBarnett/a-search` (or open a PR on this repo).
> 3. End every useful session with a harvest promote or intake flush when offline.
> 4. Never put JWT secrets, MSSQL passwords, affiliate tokens, or private hostnames in
>    filings, skills, or logs.

**Home:** https://github.com/SimonBarnett/a-search

You used these skills. You owe this home repo a report (honesty box). Silence after a
useful session is a breach. Promote learned procedures as PRs. Prefer scripts. No main
pushes for harvest.

## When you MUST report

1. You learned a **repeatable** a-search procedure (trigger + steps + owner) not already
   in a skillbook.
2. A skill was **wrong, incomplete, ambiguous, or token-wasteful**.
3. You hit a **bug**, gap, or missing tool that a deterministic test/script should own.
4. You invented a workaround that should become a skill or a code change.

Empty harvest (nothing new, nothing broken): no empty PR. That is the only quiet case.

## How to report (strict order)

0. **End-of-session fleet harvest (Bob worker seats):** always name this repo:
   `Invoke-BobiverseHarvest.ps1 -Repo SimonBarnett/a-search -Book harvest-agent-skills -Summary "..." -Lesson "..."`
   **Never** run `Invoke-BobiverseHarvest.ps1` without `-Repo SimonBarnett/a-search` for
   a-search work: its built-in default is `SimonBarnett/bobiverse`, which files the lesson
   in the wrong repo (bobiverse 2026-10-08 incident). Same for `Report-BobiverseIntakeIssue.ps1`.
1. **Playbook / fix with write access** -> branch + **pull request** to
   `SimonBarnett/a-search`. Never `git push origin main` for harvest.
2. **No GitHub write / API fail** -> Bobiverse intake webhook with
   `-Repo SimonBarnett/a-search` (`Report-BobiverseIntakeIssue.ps1`) or local outbox flush.
3. **Bugs / FRs without a ready patch** -> intake `kind: issue|fr` against
   `SimonBarnett/a-search` (labels `via-intake`; FR also `feature-request`).

## Where to put lessons

| Area | Path |
|------|------|
| Entry JWT / accept / fan-out | `entry/.grok/skills/a-search-entry/SKILL.md` |
| Live provider `<id>` | `providers/live/<id>/.grok/skills/a-search-<id>/SKILL.md` |
| Local provider `<id>` | `providers/local/<id>/.grok/skills/a-search-<id>/SKILL.md` |
| Maintainer / Parts | `maintainer/.grok/skills/a-search-maintainer/SKILL.md` |
| Caller HTTP API | `.grok/skills/a-search-endpoint/SKILL.md` |
| This honesty box | `.grok/skills/harvest-agent-skills/SKILL.md` |
| Add-source / layout docs | `docs/add-source.md`, `docs/skillbook-layout.md` |

**Do not** park a-search product tips under `SimonBarnett/bobiverse`
`common/.grok/skills/harvest/SKILL.md` (wrong book — FAIL-supersede).

Branch `harvest/…` or `fix/…` -> PR to `main`.

## Token efficiency

- Prefer a **deterministic test or script** over LLM reasoning.
- One home per fact. Point at the owner skill; do not duplicate.
- ASCII in `SKILL.md`. Short triggers in frontmatter `description`.

## Inclusion

Other a-search skills SHOULD link:

`Foundation: harvest-agent-skills (honesty box) -> report back to https://github.com/SimonBarnett/a-search.`

Every agent CWD (`entry/`, `providers/live|local/<id>/`, `maintainer/`) must carry
CAST IRON harvest pointing at this book + intake `-Repo SimonBarnett/a-search`.

## Plan gap analysis (after Phase-0)

When the Phase-0 backlog (FR-001..030 class) is **closed** and Plan/gap analysis
starts the next wave:

1. **`git fetch` + ff-only pull `origin/main`** before reading the tree (local worktrees
   often lag).
2. Write a short gap note (`docs/gap-analysis-*.md`) vs vision Success rows.
3. Open **many small** Goal / Deliverables / Testable FRs (one PR per issue) — **never**
   one umbrella FR for the whole wave.
4. First Phase-1 wire when modules exist but entry is stub: **maintainer
   `schedule.handler`** must orchestrate roll → fetch → upsert → delete (not
   `processed: 0` forever).
5. MRB of the backlog docs PR verifies Goal/Deliverables/Testable on each filed FR.

## What does **not** belong in this book

| Tip class | Durable home |
|-----------|----------------|
| Bob fleet tooling only (bob-worker exe, Jeeves offers, tray, intake service, generic `bobiverse-bob-job-mrb` process changes) | `SimonBarnett/bobiverse` - everything learned while doing a-search work (MRB merges, behind-main/keep-both on a-search PRs, CDK npm ci/synth, plan filing) stays **here** in a-search (this book or the owning `a-search-<id>` skill) |
| Per-FR product playbooks (amazon handler, ebay Browse, etc.) | Owning `a-search-<id>` / maintainer / entry skill — already on main via product PRs; tip twins FAIL-supersede |
| Provider onboarding bodies | `a-search-<id>-onboarding` under the provider folder |

## Tests / GitGuardian (a-search#611 / bobiverse#3304)

Never land contiguous secret-shaped literals in test sources. Use
`tests/fixtures/fakeSecrets.js` (runtime `joinParts` + `reLiteral` / `reFromParts`).
Obvious placeholders (`FAKE_`, `EXAMPLE`, AWS doc `AKIA…EXAMPLE`) are fine. Do not
force-push history only to clear GG false positives — fix the fixture instead.

## Do not

- Push harvest to `main`
- Commit "nothing found"
- Force-push, secrets, or live credentials into skills
- Dispatch product builds under the harvest label alone
- File thin session-receipt tips that only restate a merged product FR (close as twin)

## Harvested lessons (relocated from bobiverse, 2026-10-08)

Misfiled a-search harvests from SimonBarnett/bobiverse, moved here so no lesson is lost.
MRB: keep, reword or trim; twins are listed once with every source.

- a-search FR-042: product results use worker/lib/normalizeProduct.js + docs/result-schema.md; amazon normalize asserts shared schema; other providers can adopt later (bobiverse#3215; context: FR a-search#102 FR-042 shared result schema + normalizeProduct; amazon refactor; PR opened)
- a-search shared-move MRB CONFLICTING: keep BOTH shared requires (assertEnv from tip + writeResults from main); prefer ASCII -> over mojibake arrows; re-run env + fr047* pins before merge (bobiverse#3233; context: MRB a-search#402 CONFLICTING: merge origin/main; resolve dual require hunks to shared/assertEnv + shared/writeResults; ASCII -> comments; tests 20 pass; merged; #142 closed; filed #420 package.json files gap)
- FR-052a docs/daily-report-signups.md clubscan field map; durable a-search PR (see DONE) (bobiverse#3239; context: FR-052a daily-report-signups docs; PR opened)
- FR-052b signup store LOCKED S3 JSON writeSignups; durable a-search PR (see DONE) (bobiverse#3240; context: FR-052b S3 signup writer; PR opened)
- FR-052c listSignupEvents filters env/source/day; durable a-search PR (see DONE) (bobiverse#3241; context: FR-052c listSignupEvents reader; PR opened)
- FR-052d README links madeira-awin-clubscan daily report; durable a-search PR (see DONE) (bobiverse#3242; context: FR-052d README clubscan link; PR opened)
- a-search FR-056b: CDK Function a-search-awin-onboarding-sandbox with A_SEARCH_ENV=sandbox from providers/local/awin/onboarding/src handler.handler; schedules OOS; npm synth needs PATH Node >=20 (D:\Tools\node) (bobiverse#3250; context: FR-056b CDK awin onboarding sandbox Lambda; synth with D:\Tools\node)
- a-search CDK MRB CONFLICTING: merge origin/main keep sibling FR-056 Lambdas/schedules and the assigned live function; pin fr056c synth via tests/helpers/runCdkSynth (PATH Node 8 on marchhare breaks npm run synth); live EventBridge rule stays out of FR-056c scope (bobiverse#3280; context: MRB a-search#501 PASS: CONFLICTING tip merged with keep-both (Impact live + sandbox/schedules); #194 closed; docs hostile #606)
- a-search Madeira store locals (shopify/wix/woocommerce): scaffold as disabled local stubs like FR-022/FR-060i; registry+shortlist+folder/AGENTS/skills/.env.example/worker; keep enabled false until a wiring FR (bobiverse#3332; context: FR a-search#607: scaffolded missing local providers shopify/wix/woocommerce as disabled stubs (registry 20); PR #608)
- a-search harvest-lesson: thin session-receipt tips that only restate a merged product FR (e.g. stay-dark docs #668) FAIL-supersede; durable home is docs/phase2-providers.md (bobiverse#3345; context: MRB a-search#669 FAIL-supersede: Phase-2 stay-dark tip thin receipt of #668; already on main in docs/phase2-providers.md)
- a-search harvest-lesson: thin session-receipt of merged FR-062 (#673 live-stub onboarding) FAIL-supersede; durable home is provider-onboarding-skills.md Live stubs + per-id skillbooks (bobiverse#3346; context: MRB a-search#674 FAIL-supersede: FR-062 onboarding tip thin receipt of #673)
- a-search harvest-lesson: thin session-receipt of merged FR-063 (#677 kelkoo search.js) FAIL-supersede; durable home is providers/live/kelkoo/src/search.js + fr063 tests (bobiverse#3348; context: MRB a-search#678 FAIL-supersede: Kelkoo FR-063 tip thin receipt of #677)
- a-search harvest-lesson: thin session-receipt of merged FR-065 (#682 kijiji worker) FAIL-supersede; durable home is providers/live/kelkoo/src/worker.js (bobiverse#3351; context: MRB a-search#683 FAIL-supersede: FR-065 tip thin receipt of #682)
- a-search harvest-lesson: thin tips that only restate a finished twin-PR MRB (#680 then #682 keep-both) FAIL-supersede; durable outcome is on main in the product files (bobiverse#3352; context: MRB a-search#687 FAIL-supersede: twin normalize tip thin receipt of #680/#682)
- a-search harvest-lesson: thin session-receipt of merged FR-066 (#684 selftest+rateLimit keep-both) FAIL-supersede; durable home is kijiji selftestProbe.js + registry rateLimit (bobiverse#3353; context: MRB a-search#690 FAIL-supersede: FR-066 tip thin receipt of #684)
- a-search harvest-lesson: thin session-receipt of merged FR-067 (#691 skimlinks search) FAIL-supersede; durable home is providers/live/skimlinks/src/search.js (bobiverse#3354; context: MRB a-search#692 FAIL-supersede: FR-067 tip thin receipt of #691)
- a-search harvest-lesson: thin session-receipt of merged FR-069 (#695 skimlinks worker) FAIL-supersede; durable home is providers/live/skimlinks/src/worker.js (bobiverse#3355; context: MRB a-search#696 FAIL-supersede: FR-069 tip thin receipt of #695)
- a-search harvest-lesson: when twin harvest tips restate the same merged FR (#695/#696/#698), FAIL-supersede later twins and leave one closed reference (bobiverse#3356; context: MRB a-search#698 FAIL-supersede: twin of #696; FR-069 already on main via #695)
- a-search harvest-lesson: close later twins of the same FR-069 tip (#696/#698/#699) FAIL-supersede; product already on main via #695 (bobiverse#3357; context: MRB a-search#699 FAIL-supersede: twin of #696/#698; FR-069 on main via #695)
- Already-merged MRB re-assign: verify merge+Closes+board then DONE PASS without re-merge (FR #2237) (bobiverse#3358; context: MRB a-search#701 re-delivered already MERGED PASS (FR-070 skimlinks selftestProbe+rateLimit, #623 closed, board present))
- Thin harvest-agent-skills tip that only restates a merged Phase-2 product FR (FR-070/#701) is FAIL-supersede; durable home is providers/live/skimlinks + fr070 tests (bobiverse#3359; context: MRB a-search#702 FAIL-supersede thin harvest tip restating FR-070 skimlinks selftest already on main via #701/#623; closed unmerged)
- Thin harvest-agent-skills tip that only restates a merged Phase-2 product FR (FR-072/#705) is FAIL-supersede; durable home is providers/live/aliexpress + fr072 tests (bobiverse#3361; context: MRB a-search#706 FAIL-supersede thin harvest tip restating FR-072 aliexpress normalize already on main via #705/#625; closed unmerged)
- Thin harvest-agent-skills tip that only restates a merged Phase-2 MRB keep-both session (FR-071/#703) is FAIL-supersede; durable home is providers/live/aliexpress + mrb703/mrb705 tests (bobiverse#3362; context: MRB a-search#709 FAIL-supersede thin harvest tip restating FR-071/#703 keep-both already on main via #703+#705; closed unmerged)
- Thin harvest-agent-skills tip that only restates a merged Phase-2 product FR (FR-073/#710) is FAIL-supersede; durable home is providers/live/aliexpress + fr073 tests (bobiverse#3364; context: MRB a-search#711 FAIL-supersede thin harvest tip restating FR-073 aliexpress worker already on main via #710/#626; closed unmerged)
- Thin harvest-agent-skills tip that only restates a merged Phase-2 product FR (FR-074/#712) is FAIL-supersede; durable home is providers/live/aliexpress + fr074 tests (bobiverse#3367; context: MRB a-search#713 FAIL-supersede thin harvest tip restating FR-074 aliexpress selftest already on main via #712/#627; closed unmerged)
- Thin harvest-agent-skills tip that only restates a merged Phase-2 product FR (FR-075/#714) is FAIL-supersede; durable home is providers/live/etsy + fr075 tests (bobiverse#3369; context: MRB a-search#715 FAIL-supersede thin harvest tip restating FR-075 etsy search already on main via #714/#628; closed unmerged)
- Thin harvest-agent-skills tip that only restates a merged Phase-2 product FR (FR-076/#716) is FAIL-supersede; durable home is providers/live/etsy + fr076 tests (bobiverse#3372; context: MRB a-search#717 FAIL-supersede thin harvest tip restating FR-076 etsy normalize already on main via #716/#629; closed unmerged)
- When FR-N+1 wires IAM onto a bucket FR-N created, merge main into the CONFLICTING tip, keep early construct placement for wiring, and relax prior hostile absence-pins (mrb1087 no-grant) on the same tip before product merge; put new presence pins on docs/mrb-N after merge (context: MRB a-search#1092 FR-130 PASS after FR-129; docs/mrb #1099)
- When staging FR tips CONFLICT after sibling stage/IAM merges, keep-both require() imports and gitignore asset dirs; verify wireResultsBucketAccess still wraps the staged onboarding Lambdas before merge (context: MRB a-search#1096 FR-132 PASS; docs/mrb #1104)

## Harvested lessons (intake)

- When adding a sibling EventBridge rule that older FR pins explicitly forbade (fr056c/mrb501 no ImpactOnboardingLiveSchedule), flip those absence asserts to presence or FR-N ownership comments in the same PR as the new rule
