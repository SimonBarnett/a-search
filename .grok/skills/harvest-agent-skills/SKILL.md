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
| Behind-main merge, docs/mrb already-merged DONE PASS, CDK npm ci/synth | `SimonBarnett/bobiverse` `bobiverse-bob-job-mrb` (or a-search MRB seat notes) — FAIL-supersede if parked here as harvest tips |
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

## Harvested lessons (intake)

- Partnerize FR-085: parseFeed.js partnerizeParseFeedRowsHook matches maintainer deps.parseFeedRows; pin stay-dark enabled false; fixtures example.invalid only; never flip registry in feed-parser FRs
