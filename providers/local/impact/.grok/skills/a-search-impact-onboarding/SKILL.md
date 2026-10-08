---
name: a-search-impact-onboarding
description: >
  Agent-led Impact local MSSQL/campaign onboarding for a-search: obtain .env
  (MSSQL Parts, IMPACT_CAMPAIGN_ID), sandbox vs live, selftest pointer, drain
  agent CWD link. Use in providers/local/impact or /a-search-impact-onboarding.
  Never commit secrets. Pending-queue runner OOS.
---

# a-search Impact onboarding (provider CWD)

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake (or `gh issue`
>    when you have a token). Never leave a finding unfiled.
> 2. Harvest **setup** playbooks back into **this** skillbook; harvest search-worker
>    lessons into `a-search-impact`; harvest **drain/pending-queue** lessons into
>    `providers/local/impact/onboarding/.grok/skills/a-search-impact-onboarding`.
> 3. Never put MSSQL passwords, Impact campaign ids, account SIDs, or auth tokens
>    in a filing, skill, log, or commit.

You are in **`providers/local/impact/`**. This skillbook is **agent-led setup** for
MSSQL Parts reachability and campaign/tracked-link config. It does **not**
implement the pending-queue runner (FR-060h OOS) or the Parts SELECT client
(see `a-search-impact`).

## Goal

Lead a human through Impact campaign + MSSQL Parts config so:

1. The **local search worker** can SELECT `dbo.Parts` for `Source=impact`.
2. The **onboarding drain agent** (`onboarding/` CWD) can drain
   `dbo.ImpactPendingOnboard` when the join API is UNKNOWN.

## Obtain `.env` credentials

Secrets live in `providers/local/impact/.env` (copy from `.env.example`).
Onboarding drain may also use `onboarding/.env` — never commit either.

| Placeholder (`.env.example`) | How to obtain |
|------------------------------|---------------|
| `MSSQL_SERVER` / `MSSQL_DATABASE` | SQL host + DB that holds `dbo.Parts` for this env |
| `MSSQL_USER` / `MSSQL_PASSWORD` | SQL login (or `MSSQL_TRUSTED_CONNECTION=true`) |
| `IMPACT_CAMPAIGN_ID` | Tracked-link campaign / `subId1` tenant (FR-057); never commit a real id |
| `A_SEARCH_ENV` | `sandbox` while onboarding; `live` only after smoke OK |
| `SQS_IMPACT_URL` | From stack/env for this `A_SEARCH_ENV` |
| `S3_RESULTS_BUCKET` | Results bucket for this env |

Optional (onboarding `.env.example` only — unused while join API UNKNOWN):
`IMPACT_ACCOUNT_SID`, `IMPACT_AUTH_TOKEN`, `IMPACT_PENDING_ONBOARD_TABLE`.

Steps (agent-led):

1. Confirm Impact publisher / campaign access for the target marketplace.
2. Confirm MSSQL Parts DB for **sandbox** first (`docs/parts-maintainer.md`).
3. Fill `.env` from `.env.example`; keep secrets out of IRC/chat/logs.
4. Set `A_SEARCH_ENV=sandbox` and sandbox queue/bucket URLs.
5. Confirm `.env` is gitignored; `git status` must not show secret files.
6. Feed **ingest** stays with maintainer — this CWD does not download Impact CSV feeds.

## Sandbox vs live

| | Sandbox | Live |
|-|---------|------|
| `A_SEARCH_ENV` | `sandbox` | `live` |
| MSSQL | Sandbox Parts (+ pending table when used) | Live DBs only after smoke |
| Queues | Sandbox `SQS_IMPACT_URL` | Live queues only |
| Onboarding drain | Pending-queue / fixture drain until `remaining=0` | Same contract; no invented join API |

Refuse cross-env jobs (`message.env` must equal `A_SEARCH_ENV`).

## Drain agent (required pointer)

Pending-queue runner code is **out of scope** for this FR. Point the agent here:

- Path: `providers/local/impact/onboarding/`
- Skill: `onboarding/.grok/skills/a-search-impact-onboarding/SKILL.md`
- AGENTS: `onboarding/AGENTS.md`
- Docs: `docs/onboarding-agents.md`, `docs/impact-pending-onboard-queue.md`

Join API remains **UNKNOWN** — drain `dbo.ImpactPendingOnboard` until
`remaining === 0` per that skillbook.

## Selftest pointer

FR-059 family: `docs/endpoint-selftest.md`,
`providers/local/impact/src/selftestProbe.js` (MSSQL reachable **or**
`IMPACT_CAMPAIGN_ID` present).

Until deploying selftest: run `tests/fr059k-impact-selftest-probe.test.js` with
injectable `connect` (no live SQL required for unit fixtures).

## After onboarding

1. Runtime search: `.grok/skills/a-search-impact/SKILL.md`
2. Drain/pending: `onboarding/.grok/skills/a-search-impact-onboarding/SKILL.md`
3. Contract: `docs/provider-onboarding-skills.md` (FR-060a)

## Harvested lessons (relocated from bobiverse, 2026-10-08)

Misfiled a-search harvests from SimonBarnett/bobiverse, moved here so no lesson is lost.
MRB: keep, reword or trim; twins are listed once with every source.

- FR-051d Impact onboarding skill CAST IRON + drain remaining=0; durable a-search PR (see DONE) (bobiverse#3238; context: FR-051d impact onboarding skill CAST IRON; PR opened)
