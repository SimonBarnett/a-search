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
`common/.grok/skills/harvest/SKILL.md` (wrong book ├âãÆ├åÔÇÖ├âÔÇÜ├é┬ó├âãÆ├é┬ó├â┬ó├óÔÇÜ┬¼├à┬í├âÔÇÜ├é┬¼├âãÆ├é┬ó├â┬ó├óÔé¼┼í├é┬¼├âÔÇÜ├é┬Ø FAIL-supersede).

Branch `harvest/├âãÆ├åÔÇÖ├âÔÇÜ├é┬ó├âãÆ├é┬ó├â┬ó├óÔÇÜ┬¼├à┬í├âÔÇÜ├é┬¼├âãÆ├óÔé¼┼í├âÔÇÜ├é┬ª` or `fix/├âãÆ├åÔÇÖ├âÔÇÜ├é┬ó├âãÆ├é┬ó├â┬ó├óÔÇÜ┬¼├à┬í├âÔÇÜ├é┬¼├âãÆ├óÔé¼┼í├âÔÇÜ├é┬ª` -> PR to `main`.

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
3. Open **many small** Goal / Deliverables / Testable FRs (one PR per issue) ├âãÆ├åÔÇÖ├âÔÇÜ├é┬ó├âãÆ├é┬ó├â┬ó├óÔÇÜ┬¼├à┬í├âÔÇÜ├é┬¼├âãÆ├é┬ó├â┬ó├óÔé¼┼í├é┬¼├âÔÇÜ├é┬Ø **never**
   one umbrella FR for the whole wave.
4. First Phase-1 wire when modules exist but entry is stub: **maintainer
   `schedule.handler`** must orchestrate roll ├âãÆ├åÔÇÖ├âÔÇÜ├é┬ó├âãÆ├é┬ó├â┬ó├óÔé¼┼í├é┬¼├âÔÇÜ├é┬á├âãÆ├é┬ó├â┬ó├óÔé¼┼í├é┬¼├â┬ó├óÔé¼┼¥├é┬ó fetch ├âãÆ├åÔÇÖ├âÔÇÜ├é┬ó├âãÆ├é┬ó├â┬ó├óÔé¼┼í├é┬¼├âÔÇÜ├é┬á├âãÆ├é┬ó├â┬ó├óÔé¼┼í├é┬¼├â┬ó├óÔé¼┼¥├é┬ó upsert ├âãÆ├åÔÇÖ├âÔÇÜ├é┬ó├âãÆ├é┬ó├â┬ó├óÔé¼┼í├é┬¼├âÔÇÜ├é┬á├âãÆ├é┬ó├â┬ó├óÔé¼┼í├é┬¼├â┬ó├óÔé¼┼¥├é┬ó delete (not
   `processed: 0` forever).
5. MRB of the backlog docs PR verifies Goal/Deliverables/Testable on each filed FR.

## What does **not** belong in this book

| Tip class | Durable home |
|-----------|----------------|
| Bob fleet tooling only (bob-worker exe, Jeeves offers, tray, intake service, generic `bobiverse-bob-job-mrb` process changes) | `SimonBarnett/bobiverse` - everything learned while doing a-search work (MRB merges, behind-main/keep-both on a-search PRs, CDK npm ci/synth, plan filing) stays **here** in a-search (this book or the owning `a-search-<id>` skill) |
| Per-FR product playbooks (amazon handler, ebay Browse, etc.) | Owning `a-search-<id>` / maintainer / entry skill ├âãÆ├åÔÇÖ├âÔÇÜ├é┬ó├âãÆ├é┬ó├â┬ó├óÔÇÜ┬¼├à┬í├âÔÇÜ├é┬¼├âãÆ├é┬ó├â┬ó├óÔé¼┼í├é┬¼├âÔÇÜ├é┬Ø already on main via product PRs; tip twins FAIL-supersede |
| Provider onboarding bodies | `a-search-<id>-onboarding` under the provider folder |

## Tests / GitGuardian (a-search#611 / bobiverse#3304)

Never land contiguous secret-shaped literals in test sources. Use
`tests/fixtures/fakeSecrets.js` (runtime `joinParts` + `reLiteral` / `reFromParts`).
Obvious placeholders (`FAKE_`, `EXAMPLE`, AWS doc `AKIA├âãÆ├åÔÇÖ├âÔÇÜ├é┬ó├âãÆ├é┬ó├â┬ó├óÔÇÜ┬¼├à┬í├âÔÇÜ├é┬¼├âãÆ├óÔé¼┼í├âÔÇÜ├é┬ªEXAMPLE`) are fine. Do not
force-push history only to clear GG false positives ├âãÆ├åÔÇÖ├âÔÇÜ├é┬ó├âãÆ├é┬ó├â┬ó├óÔÇÜ┬¼├à┬í├âÔÇÜ├é┬¼├âãÆ├é┬ó├â┬ó├óÔé¼┼í├é┬¼├âÔÇÜ├é┬Ø fix the fixture instead.

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
- a-search product MRB: when tip is far behind main, merge origin/main into the FR branch and re-wait CI before gh pr merge; put additive hostile pins (registry stay-dark stubs + index needles) on one docs/mrb-N PR from the new main tip after product merge; file a follow-up FR for planned-wave table rows that Simon already closed not-planned (do not FAIL the index-only FR for adjacent wave annotations).
- Harvest-lesson tips must append/fold one bullet on current main SKILL.md never rewrite/wipe the book; neutralize GitHub close keywords in session summaries so tips do not Closes product issues (MRB #1332 / #1338).
- a-search behind-main FR-158 stack conflict: keep resolveStageSuffix+costTags then FR-149/FR-158 no-VPC egress comment; release-gap Yes for 153-157 + FR-158
- Phase-4 enable FR: after enabling an id, retarget mrb668 Phase-2 stub count (and fr166 PHASE2_STUB_IDS) down by 1 and FR-142/143 floors to 2*enabled_count before CI; concurrent open enable tips stay dark until merged
- Phase-4 enable: after flipping registry+stay-dark lists, also flip leftover hostile pins that still assert the id enabled=false (title may already say FR-N enabled while asserts stay false)
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
- Stacked FR tip on non-default base: retarget to main so Closes links; when required-ci blocks on multi-hour Actions queue with local green unit tests, document admin-merge + file CI backlog intake; close parent tip as superseded.
- FR-200 /go unapproved path: inject resolveTxt into shared/dns/hostTxtStatus; Club TXT a-search-club= required; Partner alone never unlocks; /ext/status shares the same cache; stack on FR-199 tip when Parts+/go not yet on main
- ComponentsPiece in.json ingest: exclusive rename to in.processing.json then merge+cap+unlink; free live cap 10; stack on FR-205 tip; non-main base MRB hand-close.
- ComponentsPiece prune/top10: host-level top10 only; prune exclude+expiry+broken flags without HTTP; re-apply live cap each pass; stack on FR-206 tip; non-main base MRB hand-close.
- ComponentsPiece widget click: buildGoUrl host+widgetGuid+part only; open via openUrl/window.open noopener; pin partsHtml never embeds part.url; stack on FR-202 tip; non-main base MRB hand-close.
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
- a-search FR-2078: chrome.identity.launchWebAuthFlow against shared login (?extension=1&redirect_uri=); JWT session-only; logged-in bar commission/Stripe/Claim(club)/Upgrade/Create-clipboard; Edit dialog PATCH+feedback; pin fixtureJwt
- a-search MRB docs/hostile: always run docs/mrb-N hostile suite green before gh pr merge; never merge a docs tip that fails its own pin; prefer assert.match on forbid prose (e.g. never-use partner_monthly) over assert.doesNotMatch for banned tokens that must remain documented (FR-2054 / context mrb-1869 #2052 red then #2053 fix)
- a-search CI queue starvation (FR-2021): keep job id test-and-synth for required-ci-3948; add concurrency cancel-in-progress per PR/ref; path-aware skip npm run synth when PR touches only docs/skills/tests (always synth on main push and when cdk/providers/entry/maintainer/shared/package.json change); npm test still always runs
- a-search MRB docs/mrb worktree: when git worktree add fails because branch docs/mrb-N-hostile is already checked out in a stale docs-mrb-a-search-N tree, use a unique local branch suffix -mh{seat} (git worktree add -B docs/mrb-N-hostile-mh{seat} <path> origin/pr-N) then push HEAD:docs/mrb-N-hostile; optionally Clear-BobiverseJobWorktrees for abandoned trees; never force-remove another seat marked worktree (FR-1955 / context MRB #1799)
- a-search MRB tip-loop close after Invoke-BobiverseHarvest -ExistingPrUrl: close twins one `gh pr close <N>` at a time; select only PRs whose body cites Existing PR pull/N for this job or exact title StartsWith of the harvest lesson; never pipe a multi-number Where-Object list into one `gh pr close` (gh exits too many arguments and a loose filter nearly swept unrelated open tips; FR-1947 / context MRB #1871)
- Re-offered or already-covered FR: if a merged PR already Closes the FR, ACK, verify acceptance on main, DONE with that PR URL; never open a second implement PR.
