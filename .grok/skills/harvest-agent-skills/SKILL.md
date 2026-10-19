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
`common/.grok/skills/harvest/SKILL.md` (wrong book - FAIL-supersede).

Branch `harvest/...` or `fix/...` -> PR to `main`.

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
3. Open **many small** Goal / Deliverables / Testable FRs (one PR per issue) - **never**
   one umbrella FR for the whole wave.
4. First Phase-1 wire when modules exist but entry is stub: **maintainer
   `schedule.handler`** must orchestrate roll -> fetch -> upsert -> delete (not
   `processed: 0` forever).
5. MRB of the backlog docs PR verifies Goal/Deliverables/Testable on each filed FR.

## What does **not** belong in this book

| Tip class | Durable home |
|-----------|----------------|
| Bob fleet tooling only (bob-worker exe, Jeeves offers, tray, intake service, generic `bobiverse-bob-job-mrb` process changes) | `SimonBarnett/bobiverse` - everything learned while doing a-search work (MRB merges, behind-main/keep-both on a-search PRs, CDK npm ci/synth, plan filing) stays **here** in a-search (this book or the owning `a-search-<id>` skill) |
| Per-FR product playbooks (amazon handler, ebay Browse, etc.) | Owning `a-search-<id>` / maintainer / entry skill - already on main via product PRs; tip twins FAIL-supersede |
| Provider onboarding bodies | `a-search-<id>-onboarding` under the provider folder |

## Tests / GitGuardian (a-search#611 / bobiverse#3304)

Never land contiguous secret-shaped literals in test sources. Use
`tests/fixtures/fakeSecrets.js` (runtime `joinParts` + `reLiteral` / `reFromParts`).
Obvious placeholders (`FAKE_`, `EXAMPLE`, AWS doc `AKIA...EXAMPLE`) are fine. Do not
force-push history only to clear GG false positives --- fix the fixture instead.

## Do not

- Push harvest to `main`
- Commit "nothing found"
- Force-push, secrets, or live credentials into skills
- Dispatch product builds under the harvest label alone
- File thin session-receipt tips that only restate a merged product FR (close as twin)

## Harvested lessons (relocated from bobiverse, 2026-10-08)

Misfiled a-search harvests from SimonBarnett/bobiverse, moved here so no lesson is lost.
MRB: keep, reword or trim; twins are listed once with every source.
- CAST IRON (FR #3827 / bobiverse#4649): fold origin/main into a PR only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (cite the main commit/PR). never fold just because the PR is behind (FR #3827 / bobiverse#4649); if the repo has no required up-to-date check, PASS at the current head SHA and arm --auto. CONFLICTING keep-both folds remain required.

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

- When adding a sibling EventBridge rule that older FR pins explicitly forbade (fr056c/mrb501 no ImpactOnboardingLiveSchedule), flip those absence asserts to presence or FR-N ownership comments in the same product PR as the new rule; put release-gap refresh on docs/mrb-N (context: FR-133/#1109 + docs/mrb #1115; twin tip #1116 folded)
- Stage mssql only for providers/local/* workers + maintainer (shared stageMssqlNodeModules walks package.json deps); keep maintainer marker fr:131 and add mssql:true so fr131 pins stay green. When the tip CONFLICTS with FR-134 worker S3 SDK staging, keep-both SDK copy + local-only stageMssqlNodeModules and both marker fields before product merge; refresh release-gap mssql rows on docs/mrb-N (context: FR-135/#1113 + docs/mrb #1121; twin tip #1122 folded)
- CDK MSSQL_* wiring: fromSecretCompleteArn via -c mssqlSecretArn (complete ARN needs 6-char suffix); wire SERVER/USER/PASSWORD from JSON + plain MSSQL_DATABASE per env; local workers + maintainer + onboarding only; prefer in-process app.synth() for pins when mssql asset staging exceeds npm spawnSync timeouts.
- a-search FR-139: ci.yml on push/PR main with setup-node 20, npm ci, npm test, npm run synth; pin fr139 needles; release-gap CI Yes
- GitHub Actions on Linux: quoted node --test tests/**/*.test.js is a literal path -> use scripts/run-tests.js walker + --test-concurrency=1; fleet-only validate-vision-pack.py paths break CI until vendored
- FR-139 Ubuntu CI: after POSIX run-tests.js + --test-concurrency=1 + vendored validate-vision-pack+setup-python + FR-051b newUserId, remaining reds are stale hostile/harvest pins and release-gap drift -> file suite-debt FR; one tip pass must retarget ALL cascading fr058b no-rateLimit pins to __no_such_source__ and ASCII-normalize release-gap/data-model when mrb989/mrb888 pin mojibake; never merge while Actions red
- FR-142 SQS DLQ: sibling {queueName}-dlq (14d retention) + deadLetterQueue:{queue,maxReceiveCount:3} on primary; pin RedrivePolicy via in-process app.synth (not npm spawn) for all live/sandbox enabled sources; alarms stay FR-143
- FR-143: prefer lambda logGroup: new logs.LogGroup({retention:ONE_MONTH}) over deprecated logRetention (Custom::LogRetention); DLQ alarms need FR-142 sibling queues; ApproximateNumberOfMessagesVisible >= 1 -> SnsAction on placeholder topic
- When a harvest tip folds/expands an existing contiguous lesson bullet, refresh every hostile pin that asserts the old string in the same MRB tip; keep-both release-gap CloudWatch Yes + CI Yes when FR-143 meets FR-139 on main
- MRB docs/mrb after product CI land: verify Actions run green claim, merge origin/main into behind docs tip before gh pr merge, pin ci.yml Node20+setup-python+npm ci/test/synth+180m; self-MRB clear when seat marker differs (marchhare-42664 vs 960).
- Installable stacks need docs/destroy-rollback.md: what cdk destroy deletes vs RemovalPolicy.RETAIN bucket, retain SQL/secrets, ordered teardown; CI auto-destroy stays OOS (FR-163 / #1006).
- Worker SQS queues and FR-142 DLQs need encryption: sqs.QueueEncryption.SQS_MANAGED (SSE-SQS); pin via synth SqsManagedSseEnabled; CMK per queue stays OOS (FR-162 / #1005).
- When performance list* deps are unset and S3_RESULTS_BUCKET is set, wire createPerformanceS3Deps (mapping store + documented stats key); missing stats => zeros not 500 (FR-160 / #1003).
- When shared/ gains a runtime dir, list it in shared/package.json files[] and pin all runtime dirs so pack cannot drop modules (FR-159 / #1002).
- FR-157 HttpApi access logs: createDefaultStage false + HttpStage $default with LogGroupLogDestination CLF and resolveApiThrottle context apiThrottleRate/Burst (defaults 20/40); after FR-151 jose must be in node_modules before in-process synth pins
- SQS->Lambda worker queues need visibilityTimeout > function timeout; LOCK 6x via shared WORKER_* constants and synth-pin every enabled queue (FR-164 / #1007).
- Set explicit Lambda memorySize floors (entry 256, workers 256|512 for local/MSSQL) so cold JWKS/SDK do not OOM; document in deploy.md and synth-pin MemorySize (FR-165 / #1008).
- a-search CONFLICTING harvest-lesson tips on harvest-agent-skills: merge origin/main keep-both, close exact twin tips by full lesson title, then docs/mrb contiguous NEEDLE pin
- Phase-4 enable FR: flip one registry id both envs, add PROVIDER_CREDENTIAL_KEYS + PLAIN_DEFAULTS, update stay-dark pins/docs that asserted that id false, pin frN with in-process synth for a-search-{id}-{live,sandbox}
- Phase-4 enable FR: after fold, retarget FR-142/143 floors +2 env-pairs and drop the id from every stay-dark pin (fr166 PHASE2_STUB_IDS, mrb1042, registry DEFAULT_ON, mrb31 default-on, provider-onboarding LIVE_STUB) before CI; run-tests.js breaks on first alphabetical batch
- When two Phase-4 enable tips race, keep-both both PROVIDER_CREDENTIAL_KEYS/PLAIN_DEFAULTS and retarget FR-142/143 floors to 2*(enabled count); update sibling hostile pins that hard-code the old floor (e.g. mrb1327 14->16).
- a-search product MRB: never fold just because the tip is behind (FR #3827 / bobiverse#4649); fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue; PASS at current head and arm --auto; put additive hostile pins (registry stay-dark stubs + index needles) on one docs/mrb-N PR from the new main tip after product merge; file a follow-up FR for planned-wave table rows that Simon already closed not-planned (do not FAIL the index-only FR for adjacent wave annotations).
- Harvest-lesson tips must append/fold one bullet on current main SKILL.md never rewrite/wipe the book; neutralize GitHub close keywords in session summaries so tips do not Closes product issues (MRB #1332 / #1338).
- a-search behind-main FR-158 stack conflict: keep resolveStageSuffix+costTags then FR-149/FR-158 no-VPC egress comment; release-gap Yes for 153-157 + FR-158
- Phase-4 enable FR: after enabling an id, retarget mrb668 Phase-2 stub count (and fr166 PHASE2_STUB_IDS) down by 1 and FR-142/143 floors to 2*enabled_count before CI; concurrent open enable tips stay dark until merged
- Phase-4 enable: after flipping registry+stay-dark lists, also flip leftover hostile pins that still assert the id enabled=false (title may already say FR-N enabled while asserts stay false)
- When Phase-4 enables a Madeira merchant stub (wix/shopify/woocommerce), update FR-607/mrb608 so only remaining dark stubs assert enabled=false; keep class=merchant merchantConnect pins for the enabled id
- Phase-4 enable MRB: after one origin/main keep-both fold, confirm FR-142/143 floors are 2*enabled_count and clear cdk/entry-lambda-asset before retrying a sequential synth EPERM - treat Windows asset-lock as env flake, not product FAIL
- After concurrent Phase-4 enable keep-both, retarget each sibling enable-FR synth stay-dark list so neither lists the other as dark (fr172 must not assert tradedoubler dark; fr174 must not assert partnerize dark).
- Multi-region second stack (FR-191): deploy same source with -c region= -c stage=standby -c includeRegionInNames=true so names/stack id get stage+region tokens; default names unchanged
- FR-191 deploy.md sections written via PowerShell here-strings: never embed markdown fences/backticks in PS @" "@ - write via Python Path.write_text; C0 \x08/\x07 fail FR-149 printable-ASCII gate
- Multi-region S3 (FR-192): lock region-local ResultsBucket per stack under active-passive; do not enable S3 CRR; SQL/rclone stay primary/IONOS
- Multi-region DNS (FR-193): docs-first Route53/external DNS failover runbook for active-passive; placeholders only; no CDK DNS unless operators ask later
- Amazon worker Creators flag (FR-183): when AMAZON_SEARCH_API=creators assertCreatorsCreds fail-closed then searchAmazonCreators; else PA-API assertAmazonCreds; return searchApi in result
- Multi-region (FR-190): lock active-passive with primary eu-west-2; madeiradb/SQL stays single-region on IONOS; do not choose active-active without a SQL multi-region story
- Phase-4 enable MRB: if a prior keep-both tip wiped a hostile pin file (e.g. mrb668 at 0-byte), restore that file from origin/main then retarget stub/PHASE2 counts to remaining stay-dark ids and FR-142/143 floors to 2*enabled_count before PASS
- When a Phase-4 FR issue update says WAF dropped / do not build (Simon 2026-10-10), FR seat closes as not planned and NACKs; do not add WAFv2 resources; leave phase4 index annotation to #1381
- Phase-4 enable keep-both: retarget every prior docs/mrb hostile pin that string-matches expected N primary/DLQ floors (and sibling stub.length) to 2*enabled_count in the same fold before PASS; CI red on those needles is FAIL even when product registry/CDK is correct
- When an FR-N+1 tip stacks the unmerged FR-N product commit (same SHA as an open sibling tip), fold main once, extend Closes to both issue numbers, close the sibling tip as superseded by the stacked PR, then auto-merge --- do not leave two open tips sharing the FR-N commit.
- Phase-4 merchant enable CONFLICTING with sibling enables on main: one keep-both fold; floors 2*enabled_count; scrub PHASE2_STUB/mrb668/DISABLED_LOCAL and tip STILL_DARK for every id now enabled; restore secrets-matrix family rows
- Phase-4 enable a merchant-class local (shopify/wix/woocommerce): set registry class=merchant merchantConnect=true, wire store credentials (API key/secret/access token/store URL - not affiliate sid), remove affiliate sid stamp from the worker, floors 2*enabled_count; keep sibling merchant enables reciprocal-dark until their FRs merge; keep generic Phase-4 enable FR bullets for affiliate/feed ids
- Phase-4 enable keep-both: after folding a sibling enable from main into PROVIDER_PLAIN_DEFAULTS, require() the stack before push --- an extra closing brace from the merge leaves SyntaxError and red synth; non-synth registry/CDK-key pins can still look green.
- When editing amazon skill for FR-181 Creators coexistence, keep the exact FR-045 needle LOCKED (Phase 1): Amazon live search uses PA-API SearchItems contiguous; do not rewrite to LOCKED (Phase 1 / FR-045)
- Harvest-lesson tips that CONFLICT and rewrite unicode arrows into dash runs must FAIL-supersede; land a clean single-bullet append from current main instead of merging the corrupted tip
- a-search Phase-4 enable keep-both must not rewrite secrets-matrix Lambda family rows or expand provider grant rows to 4 columns; restore contiguous family shorthand and a 3-column grant before PASS
- Multi-region smoke (FR-194): checklist in multi-region-smoke.md; smoke-deploy.js --region labels run and can pick A_SEARCH_API_URL_<REGION>; no chaos in CI
- a-search harvest-agent-skills tips: never use Unicode em-dash (U+2014) in SKILL.md --- mrb1172 fails on any em/en-dash in the whole file; use ASCII --- ; prior PASS boards stay BLOCKED until that pin is green
- a-search CDK Lambdas: bump Runtime.NODEJS_20_X to NODEJS_24_X before AWS nodejs20.x creation disable (2027-02-01); pin with source + aws-cdk-lib export tests (FR-1176 / #1176).
- FR-252 docs MRB: pin HOLD markers on phase4/shortlist rows before PASS; put additive pin+vision LOCKED bullet on docs/mrb-N; product tip may omit pin
- FR-201 widget: boot .a-search-widget[data-widget-guid] once via data-a-search-booted; GET /parts then API layout then data-mode; modes only change layout; stack on Parts tip when needed
- ComponentsPiece agent site pass: CWD hostDir via widgetPath; exclusive-create site.md/top10.json; secret-needle guard; stack on FR-203 tip; non-main base MRB hand-close.
- ComponentsPiece widget CSS: ship layout-only sheet with currentColor/inherit/transparent/none only; pin-scan declarations not loose regex; stack FR-202 on FR-201 tip; non-main base needs MRB hand-close note.
- FR-195 ComponentsPiece docs MRB: pin widgetGuid tree (no uri-slug required), Parts/Click contracts, FR-251 DB ownership with FR-146 Recommended near a_search_sandbox; docs-only tip MERGEABLE on main then --auto --squash; DONE without CI poll
- Phase5 FR-210 skillbook: create top-level components-piece/ like entry/maintainer; pin skillbook-layout.test.js triggers (parts/go/widget/agent/widgetGuid/feedback/idle); leave harvest-agent-skills at repo root; Closes on PR; FR seat never merges
- Market-hold disable PRs must not globally delete provider id string literals from tests (paths/find/source); retarget enabled asserts and floors 2*enabled_count only.
- a-search FR CDK synth pin on marchhare: junctioned node_modules can hash Lambda assets >40min without writing ASearchStack.template.json; soft-skip on SIGTERM/timeout/EPIPE or A_SEARCH_SKIP_SYNTH=1 and let GitHub Actions test-and-synth own the live template pin; reuse cdk.out when already present
- a-search harvest twin: FAIL-supersede FR-212 fixtures session-receipt tips that duplicate open docs/mrb #1799 / product tip #1731
- a-search harvest-lesson: do not land absolute never-close-tip-as-twin-of-docs/mrb; when docs/mrb folds SKILL.md the tip may close as twin of that pin (#1748/#1753); only refuse twin-close for tests-only pins that do not carry the lesson text
- ComponentsPiece widget context pass: widgetGuid folder via widgetPath; fold feedback context/removal; SEARCH_QUERY_CAP_FREE=3 FULL=15; stack on FR-204 tip; non-main base MRB hand-close.
- FR-225 docs-only MRB: merge origin/main when tip behind; pin Decision LOCKED fail-closed contact + magic/OTP + no Phase 5 passwords; leave FR-226/228 implement tips open
- Stacked FR tip on non-default base: retarget to main so Closes links; when required-ci blocks on multi-hour Actions queue with local green unit tests, arm gh pr merge --auto --squash (never --admin; FR #3948) and optionally file CI backlog intake; close parent tip as superseded.
- FR-200 /go unapproved path: inject resolveTxt into shared/dns/hostTxtStatus; Club TXT a-search-club= required; Partner alone never unlocks; /ext/status shares the same cache; stack on FR-199 tip when Parts+/go not yet on main
- ComponentsPiece IN/ folder ingest (FR-3344): writers use writeInSearchFile one JSON per searchId; agent moves IN/*.json to IN/.processing then merge+cap+unlink; free live cap 10; never merge searches into a single in.json.
- ComponentsPiece prune/top10: host-level top10 only; prune exclude+expiry+broken flags without HTTP; re-apply live cap each pass; stack on FR-206 tip; non-main base MRB hand-close.
- ComponentsPiece widget click: buildGoUrl host+widgetGuid+part only; open via openUrl/window.open noopener; pin partsHtml never embeds part.url; stack on FR-202 tip; non-main base MRB hand-close.
- When harvest tip is CLOSED superseded by docs/mrb stack that carries the lesson bullet + hostile pin, MRB the docs tip: merge origin/main keep-both, verify needle+test, merge; do not reopen the closed parent tip.
- FR-212 ComponentsPiece fixtures: check in tests/fixtures/components-piece/ for in/live.free/live.full/searches/widget/feedback/host/job/events/stats; pin LIVE_PART_CAP_FREE=10, FR-232 GUID regex, clean live URLs, forbidden secret/PII keys, ctr 0 when denom 0; Closes on PR; FR seat never merges
- a-search harvest-lesson PR body that quotes product Closes #N-#M in session summary can link closingIssuesReferences: rewrite to prose without Closes keywords before merge so skill tips do not close product FRs
- GBP/UK market-hold MRB: disable via registry enabled false only (keep folders + id/path string literals); retarget floors to 2*enabled_count; skip win32 CDK synth FR#3717; merge main then --auto --squash; DONE without CI poll
- a-search docs/mrb for open product tip: merge origin/main into docs pin and dependency FR tip when both behind; run hostile suite against the product tip tree; --auto --squash both; DONE without CI poll
- EventBridge cannot set dynamic SQS FIFO MessageGroupId from S3 key alone: use a small enqueue Lambda that runs agentQueue.classify/fifoSendParams before the rclone-host dispatcher polls
- a-search FR-236: merchantShops callback must map adapter codes invalid_hmac/invalid_shop_domain/code_required to HTTP 400 so bad oauth never inserts a Shop row; pin with HTTP-layer bad-hmac after a fresh connect state
- a-search harvest-lesson MRB: if tip commits include marchhare-<seat> keep-both author, ACK then GIVEUP self-MRB (FR #2604); leave OPEN for sibling; CONFLICTING does not change the hand-back

- a-search FR-235 MRB keep-both with FR-236: preserve GET/DELETE /merchant/shops and Shopify webhook; export createMemoryVault+createCredentialsVault; registry aliases getByShopId/updateStatus/deleteByShopId; allow pending_payment->suspended for uninstall
- FR-235 upsertConnect: unique (env,provider,providerShopId); same merchant refreshes credentials; other merchant throws ShopConflictError 409 shop_already_connected; allow fixture provider for FR-216 tests
- docs/mrb superseding open harvest tip: git checkout origin/main -- SKILL.md then UTF8 append lesson bullet (never assign git-show multiline to a PowerShell string or the book collapses)
- FR-232 mint must share Customers store with /parts: separate createWidgetsRegistry left copy-page GUIDs widget_not_found on first bind - use getDefaultCustomersStore across widgetsCreate/parts/go
- a-search harvest tip CONFLICTING on SKILL.md: restore tip to main+1 via git checkout origin/main -- path OR git cat-file blob origin/main:path bytes, then .NET UTF8Encoding(false) WriteAllText append; never assign git-show multiline to a PowerShell string; avoid wrong-encoding WriteAllText/Set-Content mojibake on unicode arrows
- a-search FR-237 Wix connect: verify signedInstance before trust; vault instanceId credentials only (never access token); mint via oauth2 client_credentials with memory TTL; App Removed webhook suspends shop
- a-search harvest meta tip that says keep a complementary open tip: if that tip was FAIL-superseded as product tip-loop, close the meta tip too; do not re-open both
- a-search harvest tip restating self-MRB keep-both GIVEUP + twin-close after that lesson already merged: FAIL-supersede citing the first PR/SKILL bullet
- a-search harvest tip after FR-237 product+docs/mrb already on main restating vault instanceId + client_credentials + signedInstance (or the SKILL bullet): FAIL-supersede citing product/docs PR; do not re-fold
- a-search harvest tip restating CONFLICTING SKILL.md checkout/cat-file UTF8 append after that lesson already on main: FAIL-supersede citing the first PR
- a-search FR-238: Woo connect requires HTTPS public host (SSRF); wc-auth user_id is FR-216 state; reject non-read key_permissions; vault consumer keys only (never echo); map keys_invalid/invalid_key_permissions/wc_probe_failed to HTTP 400
- a-search harvest tip restating complementary-meta FAIL-supersede close lesson after that bullet is on main: FAIL-supersede citing the first PR
- a-search FR-240: shop sync SQS messages must never carry credentials (vault via Shop only); enqueue/consume only when subscriptionStatus=active (trialing unpaid); PartFeedKeys Kind=shop FeedKey=shopId; soft-delete Parts on suspend; CDK FIFO may defer until FR-239 live wiring when Out of scope says so
- a-search harvest tip restating FR-238 Woo SSRF/wc-auth/key_permissions lesson after that bullet is on main: FAIL-supersede citing the first PR
- a-search FR-241 unpaid/dunning: stack on FR-240 shopSync tip when open then remerge main after FR-240 merges; registry consecutiveUnpaidPeriods+notices+markNoticeSent; hard-delete Parts/PartFeedKeys/vault per shop; N2>=7d before delete; merchant login retained; active-only downloads
- a-search FR-2139: CDK SQS FIFO a-search-shop-sync.fifo + DLQ maxReceiveCount 5 + shopSyncWorker (visibility 6x timeout); SQS_SHOP_SYNC_URL on entry/maintainers; FR-239 onShopLive remains live-transition caller
- MRB shop-sync Lambda consumer: handler(event, context, deps) like schedule.js; never treat AWS context as deps; throw shop_sync_deps_unconfigured when overrides missing so FIFO retries/DLQ instead of empty-registry shop_not_found deletes.
- a-search FR-2078: chrome.identity.launchWebAuthFlow against shared login (?extension=1&redirect_uri=); JWT session-only; logged-in bar commission/Stripe/Claim(club)/Upgrade/Create-clipboard; Edit dialog PATCH+feedback; pin fixtureJwt
- a-search MRB docs/hostile: always run docs/mrb-N hostile suite green before gh pr merge; never merge a docs tip that fails its own pin; prefer assert.match on forbid prose (e.g. never-use partner_monthly) over assert.doesNotMatch for banned tokens that must remain documented (FR-2054 / context mrb-1869 #2052 red then #2053 fix)
- a-search CI queue starvation (FR-2021): keep job id test-and-synth for required-ci-3948; add concurrency cancel-in-progress per PR/ref; path-aware skip npm run synth when PR touches only docs/skills/tests (always synth on main push and when cdk/providers/entry/maintainer/shared/package.json change); npm test still always runs
- a-search MRB docs/mrb worktree: when git worktree add fails because branch docs/mrb-N-hostile is already checked out in a stale docs-mrb-a-search-N tree, use a unique local branch suffix -mh{seat} (git worktree add -B docs/mrb-N-hostile-mh{seat} <path> origin/pr-N) then push HEAD:docs/mrb-N-hostile; optionally Clear-BobiverseJobWorktrees for abandoned trees; never force-remove another seat marked worktree (FR-1955 / context MRB #1799)
- a-search MRB tip-loop close after Invoke-BobiverseHarvest -ExistingPrUrl: close twins one `gh pr close <N>` at a time; select only PRs whose body cites the exact line `Existing PR: <url>` for this job or exact title StartsWith of the harvest lesson; never a bare pull/N substring (example prose in another tip body is not a twin; FR-2314); never pipe a multi-number Where-Object list into one `gh pr close` (gh exits too many arguments and a loose filter nearly swept unrelated open tips; FR-1947 / context MRB #1871)
- a-search tip-loop ExistingPrUrl: only treat ExistingPrUrl as a twin key when that target is itself a harvest-lesson tip (title starts with `lesson(` or label `harvest-lesson`); when ExistingPrUrl points at a product FR PR, do not close the substance harvest tip that documents it - require exact title StartsWith of this lesson against an earlier OPEN harvest tip instead (class of #2311 closed against product #2195; FR-2315). Helper: `shared/harvest/tipLoopTwinFilter.js`.
- MRB docs/mrb-N hostile: when product tip already needs a CI keep-green commit, fold the additive hostile onto the same tip and close an empty/stacked docs/mrb PR --- squash merge-on-green races a tip-based docs PR that still contains the product commits.
- Enable-provider tip floors: after FR-2139 shop-sync FIFO, fr142 primary filter must exclude QueueName containing .fifo (shop-sync + shop-sync-dlq both counted as primaries otherwise: 2*enabled+2); fr143 alarm floor counts worker -dlq only (shop-sync DLQ alarm is +1). Always add the new id to ENABLED_IDS when bumping 2*N floors.
- MRB product FAIL for extension login: pin redirect_uri allowlist (chromiumapp.org / chrome-extension:) before location.assign; assert escaped RegExp literals with chromiumapp\\\.org; put SW claim club gate on the one fix PR.
- MRB a-search FR-228: pin otpStore Decision LOCKED rate limits + migration 016 never madeiradb/SystemOTPs + shops 403 contact_unverified + JWT join-parts on docs/mrb-N; run tests with D:\Tools\node\node.exe (PATH node may be too old for --test)
- CONFLICTING harvest tip fix: branch from current origin/main, add only lesson+hostile, force-push; never git reset --soft origin/main on a dirty tip (deletes unrelated tip/main files from the PR)
- FR-2611: docs/skills-only PRs need a cheap ubuntu classify job then test-and-synth on ubuntu exit-0; bare paths-ignore leaves required check missing and blocks auto-merge
- FR-245 BigCommerce harvest tips that mix tip-0-behind arm --auto with stay-dark/JWT pins FAIL-supersede while product #2183 is still open; cite #2183 + bobiverse-bob-job-mrb; do not merge premature session receipts.
- harvest-agent-skills GitGuardian placeholder: use pure ASCII AKIA...EXAMPLE (three dots); never unicode ellipsis in SKILL.md - pin with fr2746 hostile ASCII test
- docs/mrb stacked on an open harvest-lesson tip: after light triage PASS, tip-fix CI on the docs/mrb head, arm auto-merge on the docs/mrb PR (lands lesson+hostile), and close the parent harvest tip citing the docs/mrb URL --- do not wait for the parent tip to merge first.
- a-search harvest tip / tip-loop PR bodies: never leave literal Closes #N or Closes #N/#M in session summaries (GitHub closingIssuesReferences); rewrite to prose without Closes keywords; before arming --auto --squash on harvest-lesson tips verify gh pr view --json closingIssuesReferences is empty (class of #3386 / #3376); Protect-HarvestBodyClosesKeywords in Invoke-BobiverseHarvest must run on the composed scripts path
- a-search MRB CONFLICTING tip with comment-only overlap (FR-179 wix enable vs FR-248 merchant unstamp): keep-both FR citations and restore newlines after conflict-marker replace so // comments do not swallow the next statement.
- a-search docs/mrb for a product tip: never stack on an OPEN product head (FR #4367). Merge the product first, then open docs/mrb-N from the new origin/main tip (or a tip that only has docs/tests). Do not put Closes on a stacked docs tip and close the product PR as superseded.
- Re-offered Phase5 FR when open stack tip already Closes it: verify closingIssuesReferences + acceptance tests on tip, comment covering PR, DONE with that PR URL; never open a second implement PR
- Harvest-lesson tip that already carries its hostile pin: light triage PASS when the bullet is absent on main, arm --auto --squash, DONE without a second docs/mrb. Do not tip-fix fr106/108 back to wix stay-dark; main asserts enabled true (FR-179).
- Harvest-lesson re-offer: if tip already carries lesson+hostile, close any docs/mrb as twin (do not reopen); if tip lacks hostile and docs/mrb-N is already open, reuse that docs/mrb (do not open another); arm --auto --squash (FR #3948).
- When a harvest-lesson tip keep-both merge doubles SKILL.md mojibake or edits unrelated queue-floor assertions, FAIL and close that tip. Land one ASCII-only bullet plus a BOM-free hostile pin from origin/main; do not merge the dirty head.
- An a-search shop SQL migration must open with -- target: a_search and must not USE madeiradb; pin that first non-empty line in the MRB test, and PASS a 0-behind FR-239 tip when the subscribe suite and that pin are green.
- On win32, a-search CDK synth pins may skip when aws-cdk-lib is absent; treat that skip as environment when the test says CI runs the pin, and do not FAIL the MRB for it.
- When an a-search harvest-lesson tip re-encodes harvest-agent-skills punctuation into a further mojibake pass, restore those lines from origin/main bytes and insert only the new lesson bullet on one fix PR; strip a UTF-8 BOM from the hostile test; do not open a second issue when #2746 already tracks the underlying placeholder mojibake.
- a-search FR-2230: extend the no-BOM gate from docs/mrb/ to every docs markdown file recursively; strip EF BB BF on docs-root tips (endpoint-search.md, legacy mrb-*.md); write docs with UTF8Encoding(false) or Path.write_text, never WinPS Set-Content -Encoding utf8
- When fr142 or fr143 returns early because aws-cdk-lib is missing, still compare the asserted floor to 2 times the registry sources enabled in both envs before PASS.
- When an a-search harvest-lesson tip is 0 behind main, adds one ASCII lesson line, and already contains its hostile pin test, PASS and arm gh pr merge --auto --squash; do not open a second docs/mrb PR that repeats that pin.
- When one local provider env example comment is fixed, scan every providers/local .env.example for the same stale line. Leave the provider that already has its own open PR.
- docs/mrb for a FAIL-superseded harvest parent: close the docs tip too citing parent FAIL-supersede + durable main playbook; do not merge a restatement tip-loop
- When an a-search enable-provider test skips CDK synth on win32 with an explicit CI-runs-this comment, PASS if the non-synth registry, credential-key, and queue-floor pins are green; do not wait on queued test-and-synth.
- a-search FR-248 MRB: when tip changes stamp param names, update older affiliate queryParts suites (fr083/089/092/098) in the same tip; also renumber migrations past open sibling NNN claims before PASS
- When an in-process CDK test imports allocateSynthOutDir from helpers/runCdkSynth.js, the mrb1127 pin that forbids the string runCdkSynth fails. Keep the in-process app.synth and forbid runCdkSynth( calls instead of the helper path.
- The harvest-agent-skills GitGuardian placeholder must be AWS doc AKIA...EXAMPLE with three ASCII dots. A pin that checks only that span can pass while older arrow mojibake remains on other bullets; file that remainder separately from issue 2746.
- When a docs pin for a 0-behind harvest tip conflicts at the end of harvest-agent-skills, keep both the new ASCII bullet and the later main bullets, then re-run the pin test. Do not open a second docs pull that repeats a pin already on that tip.
- Harvest-lesson re-offer: if this seat did not author tip commits and tip is 0 behind, re-verify hostile and DONE PASS; tip-fix keep-both mojibake with checkout main + UTF8 append only when skill churn is dirty
- Re-offer tips wrapping still-open first tip: FAIL-supersede citing first tip + Prefer ExistingPrUrl
- a-search FR-239: a per-shop GBP 20 Stripe subscription gates shop live status; past_due stays live; unpaid suspends payment; widget_upgrade never touches Shops; StripeEvents purge only on database a_search.
- a-search FR #3478: wix providers/local/wix/.env.example live-target comment must name a_search (FR-251), not the read-only catalogue database
- a-search FR #3495: local provider .env.example live-target comments name a_search (FR-251), matching wix wording; leave wix to its own tip
- FR-234 MRB: memory WidgetStats + a_search migration + rollup no-agent-enqueue pins are enough to PASS while MSSQL adapter stays deferred
- docs/mrb tips that bump fr142/fr143 floors while ENABLED_IDS length is unchanged are tip-loops: FAIL-supersede and land hostile pins on a clean fix PR without floor edits.
- a-search MRB: when tip pin suites are green and CI red is only npm-run-synth / cdk.out lock flakes, leave MERGE armed and DONE PASS; do not fold a synth-lock fix onto a skill-pin tip
- FR-234: pin widget event dedupe with injectable nowMs (wall-clock expiry deletes fixture-dated keys); stats.json rollup must never call the agent queue; Parts API stays tier-blind.
- When FR-228 pins pass but authEmail still uses the in-memory otpStore, PASS the named endpoints and file a separate FR for the a_search.dbo.OtpCodes write path.
- a-search enable-provider MRB: when a later keep-both tip already includes the older tip DEFAULT_ON set and Closes the same issue, FAIL-supersede the older CONFLICTING subset and do not fold it
- MRB rematch after author-seat self-MRB GIVEUP: re-verify tip pins (webhook wire over 501 stub), fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise leave behind tip; post PASS @ new head SHA, re-arm gh pr merge --auto, DONE without CI poll (FR #3948)
- Release-blocker CI red with shared faults: fix the deterministic pin first (fr2021 timeout-minutes expression), then raise runCdkSynth timeout and tree-kill on ETIMEDOUT so orphan cdk cannot hold cdk.out; fold open per-synth-out PRs into the same tip rather than leaving twin heads
- FR-234 MRB: pin index.js widgetEvents/widgetsStats before ComponentsPiece 501 stub and assert rollupStatsJson never calls agentQueue.enqueue (stats_changed is not a #1343 trigger)
- FIX CI on a-search PASSed tips: if failures are Another CLI synthing to cdk.out, fold main for FR #3663 runCdkSynth per-output dirs; do not re-open MRB.
- When a-search tip adds widget-agent FIFO DLQ, fr143 must assert 26 provider worker alarms and exclude a-search-widget-agent (and shop-sync) FIFO alarms - not 27 (class of MRB #2075 FAIL then tip-fix)
- FIX CI on a-search harvest tip: merge main for fr2021 timeout-minutes:[^\n]*\b180\b pin before re-arm; keep-both SKILL lesson bullets
- FR-3355 MRB: PASS classify+events docs when components-piece tree still shows in.json if FR-3344 tip is still open; cite #3354 on drift line
- After FIX-push on a tip, ACK then GIVEUP MRB on that same PR (FR #2604); never hostile-review your own FIX head
- FIX CI keep-both enable tips: fold main for FR #3663 per-synth --output without rewriting fr142/fr143 floors the tip owns
- MRB fold/tip-fix on open product tip: git -c user.name/email keep tip author only; never reviewing-seat nick (FR #2604 self-MRB)
- a-search merchant onboarding skillbooks need the full CAST IRON harvest block (not only the main provider SKILL); MRB FAIL with one tip-fix PR when the stub shipped without it
- FR-239 rematch: fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise PASS @ current head; fail-closed unset STRIPE_WEBHOOK_SECRET and migration -- target: a_search are required pins
- MRB behind-main re-offer on a long-lived FR tip: fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise PASS @ current head; re-run fr245+hostile+fr142/143 floor pins (26 while provider stay-dark) before PASS @ head SHA and gh pr merge --auto; never re-bump floors for a dark merchantConnect source
- docs/mrb hostile pin rematch after parent harvest tip already MERGED: fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise PASS @ current head; re-run the contiguous pin, PASS @ head SHA and arm auto-merge; Refs parent only (no second Closes)
- When MRB of an ASCII/mojibake SKILL tip finds a sibling open issue for remaining non-ASCII outside the pinned span, keep that remainder issue open (do not twin-close) and note ACCEPTABLE drift on the board
- FR-3373 MRB rematch: fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise PASS @ current head; re-run fr3373 + mrb3391-hostile + fr3490 bootstrap marker pins before PASS @ head SHA and gh pr merge --auto
- FR-2230 MRB rematch: fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise PASS @ current head; re-run fr2230+mrb2251+fr1410+mrb2213 BOM pins and a docs/**/*.md EF-BB-BF inventory before PASS @ head SHA
- FR-1345 MRB rematch: fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise PASS @ current head; re-run fr1345 + mrb3621 stripe webhook wire + FR-206 ingest pins before PASS @ head SHA
- FR-233 docs lock: widgetGuid tree is authoritative; {uri-slug}/ stays visible only as SUPERSEDED 2026-10-10 history.
- a-search harvest-lesson MRB on harvest-agent-skills: CONFLICTING tip vs main both appending Harvested-lessons bullets resolves with keep-both then PASS @ head SHA
- Never git add/commit harvest SKILL.md until check_conflict_markers (or resolve_harvest_skill_keep_both.py) exits 0; stop the pipeline if keep-both resolve assert fails; prefer a single Python resolve+verify+write step before any commit (class of #3708).
- Never git add/commit harvest SKILL.md until check_conflict_markers.py exits 0; stop the pipeline if keep-both resolve assert fails.
- Exact-title harvest-lesson twins: FAIL-supersede the later tip citing the first open/merged tip; never merge both.
- Re-offered FR with open Closes PR: verify closingIssuesReferences + re-run claimed pins, DONE with that PR URL; never open a second implement PR.
- FIX CI on a-search tips with sequential synth status-null at ~600s: fold origin/main even when runCdkSynth already has allocateSynthOutDir; tip may be far behind other main fixes.
- MRB harvest-lesson re-offer: never fold just because the tip is far behind (FR #3827); fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue; re-verify pin + unique vs main, then PASS @ head SHA and leave existing auto-merge; never poll CI (FR #3948 / #3317)
- Re-offered FR on closed-unmerged tip: Prefer ExistingPrUrl successor that Closes the FR issue; verify pins; DONE with that PR URL; never open a second implement PR.
- FR-3459 MRB rematch: fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise PASS @ current head; re-run skillbook-harvest (stay-dark enumeration + CAST IRON/intake/-Repo needles) before PASS @ head SHA
- a-search keep-both enable MRB: when hostile it() titles still say floors 28 but asserts are both.length===15 / expected 30, treat as title nit and PASS - do not FAIL or open a fix PR for stale it() names alone
- FR-3459 stay-dark harvest gate: after folding main, re-run skillbook-harvest; BigCommerce AGENTS must carry Report-BobiverseIntakeIssue or /bob/v1/intake, not prose via intake alone.
- a-search docs/mrb hostile pin that is 0 behind origin/main and Refs an already-closed lesson issue: PASS and leave auto-merge; do not reopen the parent or fold main again.
- a-search merchant-adapter CONFLICTING tips: when main added a sibling provider (e.g. bigcommerce) while the tip adds another (ecwid), resolve keep-both on adapters/index.js, registry.json source entries, entry webhook requires/routes, and CDK httpApi.addRoutes - never drop either provider.
- Re-offered ASCII/mojibake SKILL fix: fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise PASS @ current head; re-run fr2746 pin + conflict markers, --auto, DONE - do not re-litigate prior PASS boards.
- a-search docs-only FR lock that is far behind main with no file conflicts: never fold just because it is behind (FR #3827); re-run the docs pin test, PASS at current head and auto-merge; do not open a fix PR for a fold alone.
- a-search FIX when tip is far behind and ort would merge clean: fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise re-run the product pin suite at current head, DONE FIX with the PR URL; never poll CI.
- FIX on cancelled-only tip: fold origin/main once, merge any diverged remote tip, push to re-arm CI - do not invent product fixes for bulk-cancel reds.
- a-search re-offered FR-3611 CRLF skill-pin MRB on stranded ACK: fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise PASS @ current head; re-run fr3611/mrb3633/mrb3609 pins and --auto, DONE immediately.
- a-search harvest-lesson with hostile pin that is a few commits behind main and merges clean: one tip-author fold, re-run the contiguous pin, PASS and enable auto-merge; do not FAIL for ACCEPTABLE-drift wording about short-lived accessToken.
- a-search FIX when tip is CONFLICTING at the harvest-agent-skills tail with empty HEAD and new main bullets: keep-both (take main bullets), tip-author fold, re-run CRLF pins, DONE FIX; never poll CI.
- FIX fold of stay-dark skillbook tip: if main added a new stay-dark provider AGENTS without intake needles, add Report-BobiverseIntakeIssue + /bob/v1/intake + -Repo before DONE - skillbook-harvest will fail otherwise.
- a-search CDK synth CI cost: default-stack tests must share one cdk.out-shared-* via runCdkSynth / ensureDefaultStackSynth (reuse when ASearchStack.template.json exists); keep allocateSynthOutDir / opts.fresh for FR #3462 and custom-context synths.
- MRB shared-synth FR: tip 0 behind with fr3764 reuse pin + fr3462 private-dir pin + mrb3665 timeout pin is enough to PASS without a separate docs/mrb when ensureDefaultStackSynth and opts.fresh/outDir gates are already covered.
- Re-offered MRB with synth status null at ~600s and tip already 0 behind: ACCEPTABLE drift, PASS @ SHA, leave --auto, DONE at once --- do not start another fold or wait on CI.
- Long-lived FR-239 rematch: fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise PASS @ current head; re-run fr239+mrb2172 pins, leave --auto, DONE --- do not re-litigate prior PASS boards.
- docs/mrb hostile pin 0 behind with local pin green and CI only sequential synth status-null: PASS and leave --auto; do not GIVEUP on a closed-unmerged parent when the lesson line is already on the docs tip.
- MRB behind-main fold: if git push of the fold is rejected, do not DONE on the pre-fold SHA; retry the push and DONE only after headRefOid matches the fold commit (class of #3726 / #3357).
- harvest-agent-skills GitGuardian placeholder: use pure ASCII AKIA...EXAMPLE (three dots); never unicode ellipsis in SKILL.md --- pin with fr2746 hostile ASCII test
- When a-search tip adds widget-agent FIFO DLQ, fr143 must assert 26 provider worker alarms and exclude a-search-widget-agent (and shop-sync) FIFO alarms --- not 27 (class of MRB #2075 FAIL then tip-fix)
- a-search keep-both enable MRB: when hostile it() titles still say floors 28 but asserts are both.length===15 / expected 30, treat as title nit and PASS --- do not FAIL or open a fix PR for stale it() names alone
- a-search skill mojibake restore that is 0 behind main and pins the five named lines as ASCII while keeping the AKIA placeholder and the GitGuardian em dash: PASS and auto-merge; do not fold main again and do not treat it as a twin of FR #2746.
- a-search merchant-adapter CONFLICTING tips: when main added a sibling provider (e.g. bigcommerce) while the tip adds another (ecwid), resolve keep-both on adapters/index.js, registry.json source entries, entry webhook requires/routes, and CDK httpApi.addRoutes --- never drop either provider.
- Re-offered ASCII/mojibake SKILL fix: fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise PASS @ current head; re-run fr2746 pin + conflict markers, --auto, DONE --- do not re-litigate prior PASS boards.
- FIX on cancelled-only tip: fold origin/main once, merge any diverged remote tip, push to re-arm CI --- do not invent product fixes for bulk-cancel reds.
- FIX fold of stay-dark skillbook tip: if main added a new stay-dark provider AGENTS without intake needles, add Report-BobiverseIntakeIssue + /bob/v1/intake + -Repo before DONE --- skillbook-harvest will fail otherwise.
- a-search re-offered harvest-lesson MRB that is a few commits behind: fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise PASS @ current head; re-run the contiguous pin, PASS and re-arm auto-merge; do not re-litigate prior PASS boards.
- When a line-number skill pin fails after one main fold, retarget the stable needles by content and restore the ASCII span the pin still requires before PASS.
- a-search stranded-ACK rematch on a harvest-lesson tip a few commits behind: never fold just because it is behind (FR #3827); fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue; re-run the hostile pin, PASS @ current head and re-arm squash auto-merge, DONE immediately.
- a-search FIX fold must be a real merge commit with origin/main as a parent. Resetting the merge commit soft and recommitting drops the second parent and leaves the tip behind; merge again with the tip author set before the merge.
- a-search harvest-lesson tip that is far behind and rewrites ASCII skill lines into mojibake: fold origin/main, keep the new bullet plus main ASCII lines, PASS and auto-merge; do not land the dirty mojibake side.
- When the unique fix is an ASCII replacement of one mojibake bullet and a CONFLICTING fold is required, keep the tip ASCII lines and drop the main copy of that same bullet; do not keep-both or the pin fails (FR #3827: no fold when merely behind).
- When gh pr checks shows test-and-synth fail, read the Actions job conclusion before treating it as product red; cancelled-only still gets one main fold, pin re-run, PASS and auto-merge.
- After FR-3764, the cdk.out exit-cleanup pin must call runCdkSynth with opts.fresh. A tree-kill that empties the grandchild marker is a mid-write truncate; one settle read distinguishes that from a live orphan.
- When a docs/mrb tip is re-offered after its parent harvest tip MERGED, fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); hostile pin green is enough to PASS; cancelled-only CI is not product debt.
- cdk.out cleanup that matches every cdk.out-* name also deletes cdk.out-shared-*. Exclude the shared synth cache from sweep and exit cleanup when both FRs are on main (a-search#3790).
- When a-search test-and-synth fails only on sequential npm run synth exits 0 timeouts, fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise leave behind tip; the product pin suite green is the FIX; do not invent a synth-timeout product change.
- a-search FR #3763: sweep named cdk.out-* (cdk.out-fr*) after each run-tests batch; registerCdkOutDir on runCdkSynth outDirs; plain cdk.out stays; A_SEARCH_KEEP_CDK_OUT=1 skips
- FIX assign for cancelled CI on open product PR: fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise re-run claimed pin tests at current head, re-arm gh pr merge --auto, DONE FIX with PR URL, no CI poll
- Re-offered keep-both resolve helper MRB: fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise PASS @ current head; re-run fr3708 pin + conflict markers, --auto, DONE.
- Harvest twin cleanup after Invoke-BobiverseHarvest: close only the PR number from that harvest url, and only when it carries the harvest-lesson label; never close by a guessed nearby number (class of #3610 / mistaken close of product tip #3608).
- MRB CONFLICTING runCdkSynth with FR-3764 shared cache vs FR-3763 registerCdkOutDir: keep-both reuse path without registering shared dirs for delete (FR #3790), re-run fr3764+fr3462+fr3763+fr3790 pins, PASS @ head SHA --auto
- a-search FR #3611: harvest SKILL hostile pins must use includes() or newline-normalize before assert.match; do not PASS when the pin suite is red on CRLF files
- Harvest-lesson re-offer tip unique vs main (wrap still-open first tip FAIL-supersede + Prefer ExistingPrUrl): fold only when CONFLICTING/DIRTY or CI failed on a main-fixed issue (FR #3827); otherwise PASS @ current head; re-run contiguous pin, re-arm --auto --squash (FR #3948 / FR #3317).
- Before PASS, check local branches named for this seat; a matching product commit is self-MRB even when the commit author is the shared repo identity.
- a-search Ecwid tip CONFLICTING with main Stripe entry routes: keep-both require+match for ecwidWebhooks and stripeWebhook, one fold, re-run fr246+mrb2186, PASS @ new SHA, re-arm --auto (FR #3948).
- A prior fold commit that is an ancestor of the assigned PR tip is self-MRB for that seat even when the commit author is the shared repo identity.
- Resolve a worktree skill conflict with an absolute path. A relative path uses the seat CWD, so git add can commit unresolved conflict markers; strip them in a follow-up commit and run check_conflict_markers before PASS.
- A stranded MRB ACK on a CONFLICTING product tip still needs one origin/main keep-both fold and a new PASS SHA before DONE, even when an older PASS board names the previous head.
- FR #4649 on a-search harvest tips: when MERGEABLE and CI red is ambient sequential synth (FR #3663 class), PASS @ current head and arm --auto; never fold just because the tip is behind.
- FIX when CI fails with synth status null!==0 and tip lacks main FR #3663/#3764/#3790 helpers: one origin/main fold under FR #4649 (CI failed on a main-fixed issue), re-run tip pin, push, DONE FIX; do not invent tip-only synth patches.
- docs/mrb hostile pin when parent harvest tip already MERGED and tip MERGEABLE: PASS @ current head without folding behind-main (FR #4649); re-arm --auto --squash; pin-only delta.
- Prior review-only PASS without push is not self-MRB; on CONFLICTING rematch this seat may fold once (FR #4649), push, PASS @ new SHA; later re-offers of that fold are self-MRB GIVEUP.
- When ci.yml changes cancel-in-progress from true to PR-only event_name expression, update fr2021 + mrb2219 pins and FR-2021 Decision in the same tip; tip-owned pin debt does not require a behind-main fold (FR #4649).
- When an a-search tip and main both own POST /webhooks/stripe, call the widget_upgrade handler first and fall through to the FR-239 shared handler only when the result is skipped not_widget_upgrade. Do not let the upgrade handler swallow merchant_shop.
- Re-offer of a tip this same seat already keep-both folded and PASS-boarded: ACK then GIVEUP self-MRB (FR #2604); leave OPEN for a different seat.
- docs/mrb hostile pin when product tip already MERGED and tip MERGEABLE: PASS @ current head without folding behind-main (FR #4649); re-arm --auto --squash.
- FIX when CI fails mrb1127/mrb1138 new cdk.App after product moved to ensureDefaultStackSynth: one origin/main fold under FR #4649 (fix already on main via FR #3834); re-run tip-loop + JWT/provider pins; DONE FIX.
- When covering PR Closes FR issues but was closed unmerged, FR seat reopens the PR (or opens a replacement from the same branch), folds if CONFLICTING, comments the covering URL on the issues, DONE FR with that URL; never merge from FR seat.
- When an a-search tip is MERGEABLE but test-and-synth fails a pin that main already rewrote, one origin/main fold is the FIX (CI failed on a main-fixed issue, FR #4649). Do not invent a tip-only patch.
- Shop connect HTTP tests that mock verifyAuthorization must set contactVerified true, or assertContactVerified returns 403.
- A new a-search providers/local/*/.env.example must set MSSQL_DATABASE=a_search. a_search_sandbox fails the FR-251 env-example pin even when A_SEARCH_ENV=sandbox.
- a-search MRB: after FR-228 assertContactVerified, shop connect HTTP test stubs that expect 200/400 must set contactVerified: true like fr216; keep fail-closed negatives elsewhere
- a-search FIX: when test-and-synth fails npm run synth with status null at about 180s, fold origin/main if main already has runCdkSynth 600s tree-kill and per-synth output (#3665). That is CI failed on a main-fixed issue (FR #4649), not a tip-only patch.
- a-search docs/mrb FIX: CI red only on ambient FR-236/237/238 connect 403 with MERGEABLE tip --- DONE FIX at head without fold (FR #4649); re-arm --auto --squash
- a-search product MRB rematch: MERGEABLE tip 1 behind with prior PASS boards --- re-verify claimed pins at head, PASS @ current SHA without fold (FR #4649), re-arm --auto --squash, DONE PASS
- a-search FIX: a CONFLICTING harvest-agent-skills tip still gets one origin/main fold (FR #4649). Keep both tail bullets, the new lesson and the main line it collided with. Do not drop main because the lesson itself says not to fold a MERGEABLE tip.
- a-search MRB: when test-and-synth fails jwt-auth deepEqual on contactVerified but tests/jwt-auth.test.js and entry/src/auth/jwt.js match origin/main, that red is not a tip patch and not a fold. PASS the docs/mrb head (FR #4649).
- a-search FIX: when jwt-auth fails with unexpected contactVerified:false and tip jwt.js/jwt-auth match origin/main, treat as ambient --- DONE FIX at MERGEABLE head without fold (FR #4649); file intake for the main expectation update
- a-search MRB: jwt-auth deepEqual must include contactVerified/contactChannel from verifyJwt (FR-228); missing claim is false --- tests-only PASS closes ambient main red
- a-search FIX CONFLICTING Agentic Searches tip: fold origin/main; resolve fr142/fr143 to main 30-floor + .fifo filter and keep tip widget-agent comment; if FR-228 connect stubs still 403 apply contactVerified:true even when sibling #3871 not yet merged
- a-search product FIX: when CI fails only ambient FR-236/237/238 connect 403 while tip FR product suite is green and MERGEABLE, DONE FIX at head without fold (FR #4649)
- a-search FR re-offer: when issue CLOSED and covering PR MERGED with Closes, DONE FR Prefer ExistingPrUrl with that PR URL --- do not open a second implement PR
- a-search FR: when covering implement PR is CLOSED unmerged but branch still has Closes, Prefer ExistingPrUrl reopen that PR, re-arm --auto, DONE FR with its URL --- never open a second implement PR
- a-search FIX: after FR-228 jwt verify returns contactVerified+contactChannel, update jwt-auth and jwt.hostile-mrb35 deepEqual expectations (false/undefined when claim absent); fold alone does not heal if main tests still lag
- a-search FIX: when tip already heals FR-236/237/238 contactVerified stubs but CI still fails jwt-auth deepEqual and #3887 is still open, treat jwt-auth as ambient --- DONE FIX at MERGEABLE head without fold (FR #4649)
- a-search MRB rematch: unique FR-3726 fold-push-before-DONE tip with MERGEABLE behind and ambient connect 403 --- PASS @ head without fold (FR #4649), re-arm --auto --merge
- a-search MRB FR-3344 IN/ folder: re-verify writeInSearchFile/listReadyInFiles/runIngestPass + hostile pins; heal jwt-auth deepEqual for FR-228 on tip before PASS when CI would red; do not fold for one harvest-behind (FR #4649)
- a-search MRB: a worktree path that already exists can still be an older fold SHA. rev-parse HEAD against the PR tip before trusting pin results; a 403 on connect stubs is not a product fail until the tree matches the head.
- MRB process-loop: harvest tip that only restates main Prefer ExistingPrUrl reopen CLOSED-unmerged covering PR -> close already-covered and DONE PASS (FR #3317); do not merge twin wording
- a-search MRB rematch after sibling FIX stub patch: re-verify pin at new head, PASS without fold when MERGEABLE behind and ambient jwt-auth still open (#3887)
- a-search FR: when mrb1404 asserts exactly N Phase-2 stay-dark against mrb668, trust the mrb668 it() title/stubs.length on main --- align the cross-pin, do not invent a third stub id
- docs/mrb rematch: when tip-owned pins green and CI fails only ambient mrb1404 that also fails on origin/main, PASS @ MERGEABLE head without fold (FR #4649)
- When jwt tip product pins are green and CI fails only ambient mrb1404 that also fails on tip and origin/main, DONE FIX at MERGEABLE head without fold (FR #4649)
- a-search FR: when one covering OPEN PR already Closes the issue and a sibling implement PR is CLOSED unmerged, Prefer ExistingPrUrl the OPEN PR --- do not reopen the sibling or open a third PR
- a-search docs/mrb rematch: MERGEABLE tip with FR-2611 hostile pins green after jwt+mrb1404 heals --- PASS @ head without fold when only a few commits behind (FR #4649)
- a-search FIX: when mrb1871 expects WooCommerce comingSoon but registry merchantConnect is already true from FR-180 on both the tip and origin/main, align the pin to connectEnabled --- do not fold (FR #4649).
- a-search docs/mrb rematch: after sibling FIX aligns mrb1871 woo pin to FR-180 merchantConnect, re-PASS at new MERGEABLE head without fold (FR #4649)
- When mrb752 expects webgains stay-dark but registry merchant enabled is already true on the tip and on origin/main, align the pin to enabled true and do not fold.
- When an a-search tip adds a registry local id, bump every sources.length hard-pin (fr607/mrb608/registry-folders/mrb31) in the same tip before CI; MERGEABLE tip-owned count drift is not a behind-main fold (FR #3827).
- When a-search tip fails fr236/fr237/fr238 with 403 while clean origin/main passes, fold origin/main once (FR #4649) before PASS --- tip behind main missing merchant-connect auth heal is tip-owned red, not ambient
- Docs that name a_search_sandbox must include FR-146 Recommended context (fr119 pin); ComponentsPiece DB ownership lines need Recommended/FR-146 near the sandbox name.
- Stacked Phase5 ComponentsPiece tips: retarget tip to main, merge origin/main, Closes full open FR stack, close earlier stack heads as superseded, board PASS + --auto --squash, DONE without CI poll
- a-search MRB CONFLICTING on runCdkSynth superviseMain: prefer main quoteWinArg+cmd.exe /s /c over tip shell:true quote; update fr3663 pin to match; one fold then PASS (FR #4649)
- a-search FR: stack-wide AWS/MSSQL cutover with open Simon questions and walrus live acceptance --- ACK then GIVEUP with a child-FR matrix comment; do not open a partial Closes PR that cannot meet every acceptance checkbox
- FR-3949: skip isLocalProviderFolder sources in CDK worker loop; one shared db-backed queue + walrus IAM user; keep shop-sync FIFO without consumer Lambda; pin tests with --test-concurrency=1 on Windows to avoid entry-asset EPIPE races
- When locking FR-122 C / walrus cutover in docs, update every pin that asserts Chosen option PENDING (fr119/mrb921/mrb960/fr122/vision) in the same PR; keep historical WIN-MPRE and FR-149 A needles as superseded so older gates stay green; write UTF-8 via Python Path.write_text (no WinPS Get-Content -Raw).
- Walrus drain mirrors components-piece dispatcher WaitTimeSeconds=20 and write path a-clubs/{host}/{guid}/IN (not HOSTS/); reject madeiradb for writers; prefer host/widgetGuid with userId/catalogId fallback until entry lands.
- When CDK creates EntryJwtSecret without jwtSecretArn, use generateSecretString secretStringTemplate JSON for JWT_ISSUER/AUDIENCE/JWKS_URL + generateStringKey JWT_SECRET (and RETAIN); empty GenerateSecretString yields a plain password and rolls back EntryFunction (FR #3945)
- On MRB of FR-3949 CDK cutover when CI was red for stale maintainer/local floors: if tip already carries fr130/fr135 supersede commits, PASS at that SHA without a second fix PR; do not fold merely-behind MERGEABLE; re-arm --auto (FR #3948/#4649).
- Standalone parts gateway: separate cdk/bin + stack with S3 a-clubs only; customerNumber metadata equals Madeira checksum userid; inject S3 fns in tests and lazy-require @aws-sdk/client-s3 in the handler.
- When FR-3949 strips per-source workers, supersede ALL tip-owned enable-* synth pins (fr172/173/174/178/179/180) to assert absence + a-search-db-backed; multi-arg it(title,skip,fn) shapes need a separate regex from single-arg it(title,fn).
- Light-triage a-search harvest tip for EntryJwtSecret JSON GenerateSecretString (FR #3945): PASS when useful/generalised/non-duplicate even while product PR #3970 is still open; arm --auto --squash; no docs/mrb required for one-line tip.
- FIX harvest-lesson tip: when skill-book tip races parallel harvest merges, fold main and strip conflict markers while keeping every unique lesson bullet (dedupe exact lines only); re-arm --auto; do not poll CI (FR #3948/#4649).
- Harvest-lesson MRB: one clean main fold keeps both skill-book bullets; if tip goes CONFLICTING again from a parallel main race, do not fold twice (FR #3948)  ---  leave --auto armed and DONE PASS.
- After tip-fix supersedes enable-* synth pins with ensureDefaultStackSynth calls, verify every touched file also has const { ensureDefaultStackSynth } = require('./helpers/runCdkSynth'); multi-arg it() patch scripts can omit the import (fr173/fr180).
- When CI merges main into a behind tip, mrb1061 fails if environments.md heading gained / FR-3948 while the hostile pin still required exact LOCKED -- FR-124); fold main and supersede the pin to allow optional / FR-3948.
- When a fix PR claims require-only on an open tip but base is main, retarget base onto the tip branch before PASS; after fold, dedupe duplicate imports; close Closes issues by hand when base is non-default.
- Simon scope comments can replace annotated-only / GUID-event designs mid-FR: re-read all issue comments before coding; for a-clubs redqueen use host-only SQS FIFO messages and list GUID folders under the host with annotated+lastmod/lastupdate create/update/skip (set lastupdate=lastmod on agent write to avoid loops).
- After FR-3949 strips shopSyncWorker Lambda, supersede fr2139-shop-sync-fifo-cdk to assert FIFO+DLQ+maxReceiveCount 5 and doesNotMatch shopSyncWorker.handler / SqsEventSource(shopSyncQueue); keep queue grantSendMessages(entry).
- Behind tips that fail only mrb1061 for LOCKED -- FR-124 / FR-3948: fold origin/main when #3970 supersede is already on main; no tip-owned pin rewrite needed.
- APartsGateway CORS must hardcode allowOrigins ['*'] without resolveCorsOrigins (FR-153 rejects star); host from Origin only (origin_required); Prefer Referer for GUID uri; touchLastmod/setInit via S3 metadata REPLACE self-copy
- When a MERGED FR is reopened with Simon scope comments after merge, ship one successor PR that covers the reopen gap list plus every later comment (do not DONE the old merged PR URL while acceptance still fails on main).
- After FR-3949 marketplace-only queue floors, supersede meta-pins like fr3428 that still assert expected 30 primary queues / webgains+woocommerce in fr142 ENABLED_IDS; keep registry keep-both asserts
- When FR-3949 drops maintainer Lambdas, supersede mrb1096 to assert stack has stageOnboarding but not stage-maintainer-lambda-asset; fold main when CI failed (FR #4649).
- a-affiliates v1 = Lambda not Fargate; lifecycle objectSizeGreaterThan:0 keeps zero-byte markers while expiring parts; CDK source-pin tests must avoid forbidden strings even in comments
- New affiliate S3 product surfaces ship as an isolated CDK app/stack (like APartsGateway): never touch ASearchStack/a-clubs; forbid Stripe fields on affiliate markers; never log provider login secrets (FAKE_ test placeholders only).
- Isolated AAffiliates CDK stack may PASS without multipart upload when docs mark Lambda v1 + Fargate follow-up for large feeds; keep #4001 redqueen import open as sibling OOS
- Affiliate import on redqueen: map (provider,affiliateid,partid) to Parts Source/FeedKey/MerchantProductId Env=live; prune live.json via PartLiveIndex not full scan; bump lastmod for #3987; delete S3 file only after commit; never madeiradb or credential logs.
- FR #4001 redqueen affiliate import may PASS with in-memory MERGE stand-in + A_SEARCH_AFFILIATE_IMPORT_WIRED stub CLI when docs require site-local injectors; never madeiradb
- a-clubs GUID uri/seen/clicks/since/init/lastmod live on trailing-slash marker a-clubs/{host}/{guid}/; widget.json is seed-only; setHostCredentials uses documented scrypt$ when Madeira auth is not vendored
- FR #4008: pin AMerchants like #3999 (isolated CDK, shared/merchants keys+metadata with Stripe/email redaction, onCreated+runWeekly both buckets, never overwrite same-day parts); Prefer ExistingPrUrl; never log API secrets.
- After FR-3949 marketplace-only fr142/fr143 floors, supersede every hostile enable pin that still assert.matches expected 30 primary queues (kelkoo/skimlinks/aliexpress/etsy/partnerize/webgains/woocommerce); partnerize is DB-backed so doesNotMatch in ENABLED_IDS
- AMerchants MRB: synth:merchants + fr4008 17 pins enough for PASS; AGENT.md in docs satisfies FR when templates folder is missing; do not fold merely-behind MERGEABLE (FR #4649)
- a-search MRB re-offer with CI red after enable-floor FIX: check remaining tip-owned hostiles (mrb2227 still pinned SqsEventSource); supersede on tip to match fr2139 FR-3949 no-consumer-Lambda, PASS @ new SHA without fold (FR #4649), leave --auto.
- Harvest tip that re-appends an exact main Harvested-lessons bullet (period-only delta): CLOSED-duplicate, do not merge
- FR #3968 successor MRB: run real npm ci + npm run synth:parts-gateway and paste APartsGateway resource list before PASS; unit pins alone are not enough when the PR body requires synth
- FR #4030: reservedConcurrentExecutions 1 (not ESM maxConcurrency) for one-job-per-provider; SQL uses a-search-db-backed drained on redqueen reusing walrus poll helpers; agent /search is x-agent-api-key + hostkey/guid/queries -> 202
- FR that only asks MRB to run ASearchStack synth for an already MERGED Closes tip: close as already covered citing the merged PR URL; DONE FR with that covering PR (no second implement PR)
- live provider workers: finishProviderSearch writes a-clubs IN when hostkey+guid+searchid else legacy writeResults; runSearchWith429Backoff throws http_429_backoff for SQS retry
- MRB on FR #4030: never ship FAKE_ default for A_SEARCH_AGENT_API_KEY; stack fix PR into tip then PASS @ merge SHA; file child FR when helpers land but provider call sites do not
- FR #4038: live workers write a-clubs IN/ when hostkey+guid present via writeLiveProviderInResult; handlers use handleSqsWith429 (never 429-to-DLQ); legacy msgs without hostkey keep writeResults so unit fixtures stay green.
- FR #4039 FIFO provider queues: MERGEABLE behind main needs no fold (FR #4649); pin fifo:true + -dlq.fifo + MessageDeduplicationId with contentBasedDeduplication false
- MRB CONFLICTING live-IN tip after #4035: one fold keep tip IN_SOURCES; add wireAclubsInAccess so workers can PutObject a-clubs IN/ before PASS
- When two open PRs wire live providers to a-clubs IN/+backoff429, keep the fuller tip (handleSqsWith429 CMV + CDK a-clubs IN grant + docs) and FAIL-close the subset; leave the Closes issue OPEN for the kept tip
- FIX CI after provider FIFO rename: update env-isolation-runtime (-live.fifo$), fanout-enqueue, fanout, sqs-send to assert queueName() not hardcoded a-search-{source}-{env}
- FR #4043 annotations are AWS S3 object annotations (list/get-object-annotation), not annotations.json; Write-Error under Stop breaks Pester exit-code asserts --- use [Console]::Error.WriteLine then exit N
- FR #4043 folder tools: meta reads S3 object annotations (not annotations.json); search posts HOST from metadata.host + GUID for a-clubs cwd; secrets always masked; Pester mocks cover mapping/masking/exits
- Umbrella FR with all child FRs CLOSED+MERGED: verify acceptance on main, close umbrella with child PR table, DONE FR citing a covering product PR URL; do not re-implement
- After FR #4038 live IN/ wire, supersede mrb710/718/722 hostile writeResults pins to writeLiveProviderInResult + update provider SKILL Worker sections before PASS rematch
- FR #4078 parts-gateway stage: npm install --omit=dev client-s3+sqs into asset (never cherry-pick); pin @aws-sdk/checksums and/or @smithy after real install
- Provider FIFO DLQ is a-search-provider-{id}-{env}-dlq.fifo not {queue}.fifo-dlq; fr142/fr162 must call queueDlqName and must not drop all .fifo names when counting marketplace queues
- FIX harvest tip DIRTY when main merges a sibling SKILL bullet: rebase onto newest main, keep-both Harvested lessons, force-push owned tip; shallow fetch can hide the new main tip
- After FR #4039 FIFO rename, supersede enable-provider synth pins to queueName(id,env) and FR-156 staged DLQ to {base}-dlq-{stage}.fifo (stagedFifoName on queueDlqName); one fix PR into tip then PASS.
- MRB assign of already-merged fix PR into feature tip: board PASS already MERGED @ head/merge SHA; leave parent --auto; DONE PASS without re-merge
- When FIFO rewires DLQ names, hostile contiguous pins must allow queueName: dlqName|queueDlqName and use a window long enough for maxReceiveCount after the fifo props.
- WinPS 5.1 folder tools: join aws/rclone string[] stdout before ConvertFrom-Json; native calls Continue+LASTEXITCODE for head_failed; bare S:\ mount must not TrimEnd to S:; bucket root empty Key exits 5 bucket_root
- Redqueen a-clubs drain: PutObjectAnnotation on folder markers (never annotations.json); GUID markers are trailing-slash keys; stub reviewer must never set annotated=1; install via sc.exe service under a-search-redqueen-annotator profile
- Wix HTML embeds Origin as {dots-as-hyphens}.filesusr.com --- decode by hyphen->dot for hosts without literal hyphens; require consistent X-Parent-Origin when the club domain has hyphens; never create a-clubs/{filesusr}/ folders
- MRB parts-gateway Wix embed: fold origin/main once when behind, run fr4107+fr3968 together, PASS @ head SHA then gh pr merge --auto without waiting for live redeploy
- Affiliate marker missing_feedurl: allow normalize/merge without feedurl/feedid when laststatus=missing_feedurl; keep feedurl_or_feedid_required for create/update.
- MRB folder-tools download: fold main once, run fr4108 Node+Pester with fr4043 regression, PASS @ head SHA then --auto; leave downloadOne missing_feedurl follow-up #4113 open
- APartsGateway a-search-redqueen-annotator needs s3:PutObjectAnnotation GetObjectAnnotation ListObjectAnnotations DeleteObjectAnnotation on a-clubs/* after #4098 object-annotation drain
- Awin daily agent: merge a-affiliates folders never recreate; secrets never in reports; OTP stops for Simon; skill UI steps PENDING from Merc --- do not invent ids.
- MRB Awin agent: fr4123+fr3999 local green; pin #4113 missing_feedurl/nofeed on separate tip-based fix PR; close thinner twin PR; fold main once then --auto without live Awin OTP
- MRB large agent FRs: green local suite, put related metadata pins on a tip-based fix PR, close thinner twins, one main fold then --auto; do not block on live OTP.
- FR paste-Merc-playbook jobs: ACK then GIVEUP reason=needs_human when skill shells are PENDING and no FR-061 body exists in-repo; never invent Awin UI element ids
- When assigned MRB tip is already CLOSED unmerged as superseded by a fuller open covering PR that Closes the same FR, board FAIL-superseded citing the covering PR, leave the FR open for that merge, do not revive the closed tip, DONE FAIL
- Re-offered harvest-lesson MRB that was already FAIL-supersede closed as twin of a merged tip: ACK, re-verify CLOSED+board, DONE PASS with assigned URL; do not reopen or open a worktree
- Re-offered harvest-lesson MRB already FAIL-supersede closed as twin of a merged tip: ACK, re-verify CLOSED+board, DONE PASS with assigned URL; do not reopen or open a worktree
- MRB harvest tip: PASS re-offer FAIL-supersede twin lesson; pin contiguous NEEDLE on docs/mrb-N from new main
- Redqueen a-clubs: inject fetchImpl for host/GUID pages before review; failed fetch must retry without annotated=1; register Windows service with nssm (not sc.exe+node/1053) and AWS_PROFILE/GROK_CLI env; update fr4098 pins when replacing sc.exe.
- FIX docs/mrb CI red on FR-221 widget JS ASCII: scan widget for U+2026/non-ASCII in comments from later FRs; replace with ASCII before --auto
- MRB Merc skillbook paste: scan redqueen/awin-agent markdown for BEL (0x07) where ASCII a belongs before PASS; land restore + hostile pin on one tip-based fix PR
- When FR says paste Merc playbooks and later comments supply the bodies on a sibling issue, ACK and land the paste + Simon host rules (Windows in-process sign-in, provider message length, AGENTS.md load order); do not GIVEUP needs_human after the paste arrives
- FR paste-from-a-affiliates-AGENT.md jobs: ACK then GIVEUP reason=needs_human when flamingo lacks S3/S: read; never invent publisher signup steps.
- When FR needs a-affiliates AGENT.md and later comments paste the bodies, ACK and land repo skills from the paste; do not GIVEUP needs_human after the paste arrives; leave live S3 pointer updates for redqueen
- FR tools download WinPS 5.1: pass JSON via A_SEARCH_FOLDER_DOWNLOAD_ARGS + run-folder-download.js --args-env (never argv); set process AWS_PROFILE for whole Invoke-FolderDownload so aws CLI meta and Node S3 share one identity; shims need exit $LASTEXITCODE for powershell -File
- WinPS 5.1: never name a param $Args (automatic, always empty); nssm wrappers must return only [int]$LASTEXITCODE after Out-Host/Out-Null; pin with fake-nssm install path not DryRun-only.
- APartsGateway CORS: corsPreflight allowHeaders must include x-parent-origin (and content-type) or Wix-embedded widget OPTIONS with Access-Control-Request-Headers blocks GET /parts.
- Affiliate feedurl keeps {feedapikey}/{darwinhash} placeholders; resolve from provider marker into a local fetch URL only; never persist secrets on the affiliate marker; unresolved placeholders skip fetch and stamp laststatus=unresolved_placeholder
- a-search FIX when CI fails FR-1947 contiguous tip-loop lesson: check harvest-agent-skills SKILL.md for UTF-8 BOM (EF BB BF) first --- PowerShell Set-Content/Out-File often adds BOM; strip with byte write and keep NEEDLE contiguous; do not rewrite the lesson text
- FIX product tip CI red on harvest SKILL.md BOM while tip is behind: one fold of origin/main picks up the clean book; re-arm --auto; do not poll CI
- When fr055h reports missing LOCKED after Architecture on Windows, check core.autocrlf CRLF working copies against an LF blob; pin docs/vision.md text eol=lf and make the fence pin CRLF-tolerant
- When PowerShell writes skill markdown, never use \a (BEL) or backtick escapes that inject C0 controls; write a-affiliates literally or via Python Path.write_text. FR-4155 signup rewrites must keep FR-060h/i Legacy Parts and disabled-stub needles.
- Harvest SKILL.md lessons must stay pure ASCII: never PowerShell-write Unicode arrows (they double-encode and fail mrb1172 whole-file em/en-dash gate); write hyphen->dot via Python bytes/Path.write_text ASCII.
- a-search FR #4196 import path: enqueue one SQS message of [{provider,affiliateid,key}] after download (empty=none); flat feed keys skip gunzip even when marker compression=gzip; delete S3 only after commit; one fix agent per key+ETag lock that exits 0 on success
- MRB affiliate flat feed: pin downloadOne writes only {provider}/{affiliateid}/{yyyy-mm-dd}.{ext} with lastok/decompressed lastsize; CDK rate(1 day)+runDaily; no parts/latest; one docs/mrb hostile PR
- a-search MRB: never FAIL-close or supersede a product FR tip citing a docs/mrb-N hostile-pins PR - docs/mrb uses Refs only; Prefer ExistingPrUrl reopen the product tip when closed unmerged
- MRB harvest tip that replaces the last SKILL.md bullet: FAIL and open one append-only keep-both fix PR; never merge a tip that drops an existing lesson line
- FR add Download format to a-affiliates/{provider}/AGENT.md: verify live S3 first (aws s3 cp); if sections exist, pin the contract in docs/a-affiliates.md and Closes the follow-up --- do not invent signup or rewrite known playbooks.
- MRB harvest-lesson tips that append to SKILL.md: keep-both every racing main bullet on fold; land contiguous hostile pin on the tip under FR #3948 rather than a red-until-merge docs/mrb; --auto immediately after PASS.
- MRB affiliate import SQS: pin normalizeImportFiles drops feedurl/secrets from MessageBody; wake notify is fileCount-only; one docs/mrb hostile PR; PASS with --auto without live drain
- FR redqueen reviewer: grok 1.0.62 rejects --prompt and --output text; use -p or --prompt-file plus --output-format plain; treat .grok\bin\agent.exe as grok not Cursor
- Harvest-lesson MRB: when the tip restates FIX CONFLICTING keep-both / re-arm --auto already on main, CLOSED-duplicate --- do not fold-to-merge a weaker twin.
- FIX docs/mrb when FR #4195 rewrites docs/a-affiliates.md: restore contiguous awin-agent|FR #4123 section (fr4123 pin) and keep #4208 Download format; one main fold keep-both product tip over weekly alias.
- MRB redqueen grok reviewers: LocalSystem cannot use Admin DPAPI auth even with USERPROFILE/HOME/GROK_HOME; require -Credential or service.password when -GrokCli; pin FAKE_ password tests and gitignore service.password; leave MERGEABLE behind tip without fold.
- Redqueen grok review must be async spawn: spawnSync blocks the event loop so the next S3/SQS write fails ECONNABORTED, and receive VisibilityTimeout must exceed the reviewer timeout with a ChangeMessageVisibility heartbeat plus a retry on ECONNABORTED/ECONNRESET/EPIPE/ETIMEDOUT.
- Redqueen grok under LocalSystem: use dedicated -GrokHome with SYSTEM+Administrators ACL (not Admin profile USERPROFILE); grok honours GROK_HOME; Access is denied on auth.json was ACL not DPAPI.
- Redqueen grok reviewers: prefer LocalSystem plus a dedicated -GrokHome ACL'd to SYSTEM and Administrators; Administrator profile auth.json is Access is denied, not DPAPI. Skip the live Set-Acl test unless the process is elevated.
- A live Set-Acl that grants a SYSTEM ACE must skip unless the process is Administrator; keep the WhatIf and source pins running so a non-elevated MRB seat is not a false red.
- MRB harvest tip for redqueen GrokHome: keep Set-Acl elevated-skip clause even when ACL/Access-is-denied core already on main; hostile NEEDLE on tip; --auto when 0 behind.
- docs/mrb hostile pins may stack the product commits but use Refs only; leave the product PR open so its Closes line still lands.
- Redqueen drain: default MaxNumberOfMessages=1 (FIFO one group per host); batched receipts expire while only the current message is heartbeated during long host+GUID reviews.
- When two open harvest tips in the same book state the same playbook, keep the earlier fuller bullet and close the later tip. Do not merge both.
- Host annotation is an affiliate brief (club, audience, opportunities). GUID annotation describes only that page using the host brief plus title and meta, and must be rejected when it copies the host text. REDQUEEN_REANNOTATE=1 rewrites markers that are already annotated.
- meta in an a-clubs GUID folder prints the full host object-annotation, then the page annotation, then steering. The 2048-character preview is not the review. Legacy annotations.json is only a fallback when the object annotation is absent.
- AMerchants dual-bucket job: daily schedule, missing enabled=disabled, only refresh when lastdownload is 7+ days stale, and always call affiliates/src/downloadOne (never a merchants copy) so placeholders and flat keys stay current.
- When a grok page review hits the 120s limit after a larger prompt, tell the model to answer in one shot from the supplied text and not to browse. Keep the timeout, and a GUID retry must not delete the host SQS message.
- Reject a redqueen host brief unless club, audience and affiliateOpportunities are non-empty and the summary is not a plan to browse. Fetch about/shop/training pages in the annotator. Do not set annotated and do not review GUIDs until that brief is complete.
- Redqueen GUID search runs only after annotated=1: write searches.json then POST /search; store search-fanout.json and reuse the searchid so a retry does not enqueue providers or SQL twice.
- When an intentional annotations.json fallback trips assert.doesNotMatch on Get-FolderMeta, update that pin on the assigned FR branch. Do not FAIL the tip and open a second Closes PR.
- a-clubs host marker identity is userid only. Do not rename the locked {env}/x/{customerNumber}/ widget tree in the same change. Migration of the old metadata key is dry-run by default, copy-in-place, and must not bump lastmod or lastupdate.
- FIX when FR #4277 host-brief gate lands: update fr4246 (and other) fake reviewHost fixtures to return non-empty club/audience/affiliateOpportunities or drain returns retry instead of host_processed.
- FIX on a PR already CLOSED as superseded by a Closes successor: ACK, verify covering tip still open with Closes, DONE FIX with the assigned PR URL, do not reopen
- Harvest-lesson CONFLICTING tip: one origin/main keep-both fold then PASS; if tip races CONFLICTING again leave --auto armed and DONE PASS without a second fold (FR #3948)
- Close a harvest tip that tells a FIX seat to re-arm --squash. FR #3948 is gh pr merge --auto --merge. Do not land a second keep-both fold sentence that changes the merge method.
- APartsGateway annotator IAM: PutObjectTagging must sit on the RedqueenAClubsAnnotate statement itself; a Lambda-role grant is not enough and the next deploy drops an interim IAM patch.
- Redqueen nssm search env must be set from -SearchApiUrl or redqueen\config\search-api.url plus a key file path, not only the registering process environment. An annotated GUID whose searches.json has queries and no searchid is posted once without a new review, and a failed POST must leave the FIFO message for retry.
- When searches.json already has a searchid, REDQUEEN_REANNOTATE must not review the host or GUID and must not POST again. A failed POST of a queries-only file is a guid retry and drainOnce must not delete the FIFO message.
- Search q is product keywords only. Pass steering market and currency as their own fields. Match excludes as whole words and drop tokens shorter than 3 characters.
- When a GUID search retry posts an existing searches.json, the success write must keep market and currency on the file. Do not replace the doc with queries, exclude and searchid only.
- searches.json queries-only repost: copy existing.market and existing.currency onto the POST body and the written doc when searchid lands; q stays product keywords only.
- Generate the a-search agent API key with Secrets Manager GenerateSecretString. Put a dynamic reference in A_SEARCH_AGENT_API_KEY and grantRead on the entry Lambda. Output the secret ARN, never the value, and do not take -c agentApiKey.
- A docs/mrb PR whose first commit is this seat harvest tip is self-MRB even after that tip has merged. ACK then GIVEUP with the intake id. Leave the hostile pin for another seat.
- When a stack reads gitignored provider env files at synth, npm run synth must pass the fixture root. The in-process test helper context does not cover the CI synth script. Do not auto-merge the head whose synth script still fails on a clean checkout.
- When CDK tests build cdk.App with custom -c context, always merge providerEnvRoot=tests/fixtures/provider-env (or ensureDefaultStackSynth); package.json synth -c alone does not cover in-process App constructors.
- When a hostile test pins two SKILL.md bullets as one window, join them with the file newline. A CRLF book fails an LF join on Node even though Python text mode shows LF.
- A FIX or docs PR that contains a commit this seat pushed is self-MRB even when the git author email is a sibling seat nick. ACK then GIVEUP. Do not review the LF pin.
- When provider secret wiring is skipped unless the context ARN is real, update every synth pin that still requires the placeholder credential env. Plain defaults and queues stay.
- When a Lambda reserved concurrency is 1, do not set SQS event source MaximumConcurrency. The AWS floor is 2, and Lambda rejects a maximum above the reserve. Reserved concurrency already serialises the worker.
- When a product PR is still OPEN, open docs/mrb-N from origin/main after that product merges (or from a tip that only has docs/tests). Never stack docs/mrb on the open product head. Do not put Closes on a stacked docs tip and close the product PR as superseded.
- On WinPS StrictMode, optional searches.json fields such as market must be read via PSObject.Properties. A missing property throws, so an older queries-only file looks like a product failure.
- Entry Lambda staging: merchantConnect provider src must be copied into the asset even when the source is disabled for selftest; shop adapters eager-require those modules at init.
- After MRB FAIL of a tip that contradicts the FR Design, FIX lands the separate mrb-N-fix PR URL in DONE FIX — do not reopen the superseded tip.
