---
name: a-search-awin-onboarding
description: >
  Agent-led Awin local network/feed/MSSQL onboarding for a-search: obtain .env
  (MSSQL Parts, AWIN_API_TOKEN, publisher id), sandbox vs live, selftest pointer,
  clubscan + drain agent CWD links. Use in providers/local/awin or
  /a-search-awin-onboarding. Never commit secrets. Scheduled drain code OOS.
---

# a-search Awin onboarding (provider CWD)

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake (or `gh issue`
>    when you have a token). Never leave a finding unfiled.
> 2. Harvest **setup** playbooks back into **this** skillbook; harvest search-worker
>    lessons into `a-search-awin`; harvest **drain/join** lessons into
>    `providers/local/awin/onboarding/.grok/skills/a-search-awin-onboarding`.
> 3. Never put MSSQL passwords, Awin API tokens, publisher ids, or feed URLs with
>    embedded credentials in a filing, skill, log, or commit.

You are in **`providers/local/awin/`**. This skillbook is **agent-led setup** for
network credentials, MSSQL Parts reachability, and feed/onboarding hooks. It does
**not** implement scheduled drain code (FR-060g OOS) or the Parts SELECT client
(see `a-search-awin`).

## Goal

Lead a human through Awin publisher / API token + MSSQL Parts config so:

1. The **local search worker** can SELECT `dbo.Parts` for `Source=awin`.
2. The **onboarding drain agent** (`onboarding/` CWD) can join/signup when live
   hooks are enabled — after clubscan parity review.

## Obtain `.env` (network / feed / MSSQL)

Secrets live in `providers/local/awin/.env` (copy from `.env.example`). Onboarding
drain may also use `onboarding/.env` — never commit either.

| Placeholder (`.env.example`) | How to obtain |
|------------------------------|---------------|
| `MSSQL_SERVER` / `MSSQL_DATABASE` | SQL host + DB that holds `dbo.Parts` for this env |
| `MSSQL_USER` / `MSSQL_PASSWORD` | SQL login (or `MSSQL_TRUSTED_CONNECTION=true`) |
| `AWIN_API_TOKEN` | Awin publisher API token (parser / maintainer / onboarding hooks) |
| `AWIN_PUBLISHER_ID` | Tracked-link `awinaffid` tenant (FR-057); never commit a real id |
| `A_SEARCH_ENV` | `sandbox` while onboarding; `live` only after smoke OK |
| `SQS_AWIN_URL` | From stack/env for this `A_SEARCH_ENV` |
| `S3_RESULTS_BUCKET` | Results bucket for this env |

Steps (agent-led):

1. Confirm Awin publisher account + API token access.
2. Confirm MSSQL Parts DB for **sandbox** first (`docs/parts-maintainer.md`).
3. Fill `.env` from `.env.example`; keep tokens out of IRC/chat/logs.
4. Set `A_SEARCH_ENV=sandbox` and sandbox queue/bucket URLs.
5. Confirm `.env` is gitignored; `git status` must not show secret files.
6. Feed **ingest** stays with maintainer — this CWD does not download CSV feeds.

## Sandbox vs live

| | Sandbox | Live |
|-|---------|------|
| `A_SEARCH_ENV` | `sandbox` | `live` |
| MSSQL | Sandbox Parts DB | Live Parts DB only after smoke |
| Queues | Sandbox `SQS_AWIN_URL` | Live queues only |
| Onboarding drain | Fixture programmes only (see drain skill) | Live join only after clubscan parity |

Refuse cross-env jobs (`message.env` must equal `A_SEARCH_ENV`).

## Clubscan + drain agent (required pointers)

**Legacy clubscan (parity):**

- Tree: https://github.com/SimonBarnett/AWS/tree/main/Lambdas/madeira-awin-clubscan
- Onboarding route: https://github.com/SimonBarnett/AWS/blob/main/Lambdas/madeira-awin-clubscan/routes/onboarding.js

Read clubscan `routes/onboarding.js` before changing join/signup behaviour.

**Drain agent CWD (scheduled until `remaining=0`):**

- Path: `providers/local/awin/onboarding/`
- Skill: `onboarding/.grok/skills/a-search-awin-onboarding/SKILL.md`
- AGENTS: `onboarding/AGENTS.md`
- Contract: `docs/onboarding-agents.md`

This FR does **not** change drain/schedule code — only links the agent there.

## Selftest pointer

FR-059 family: `docs/endpoint-selftest.md`, `providers/local/awin/src/selftestProbe.js`
(MSSQL reachable **or** `AWIN_API_TOKEN` present).

Until deploying selftest: run `tests/fr059j-awin-selftest-probe.test.js` /
`tests/awin-query-parts.test.js` with injectable `connect` (no live SQL required
for unit fixtures).

## After onboarding

1. Runtime search: `.grok/skills/a-search-awin/SKILL.md`
2. Drain/join: `onboarding/.grok/skills/a-search-awin-onboarding/SKILL.md`
3. Contract: `docs/provider-onboarding-skills.md` (FR-060a)

## Harvested lessons (relocated from bobiverse, 2026-10-08)

Misfiled a-search harvests from SimonBarnett/bobiverse, moved here so no lesson is lost.
MRB: keep, reword or trim; twins are listed once with every source.

- FR-050e awin onboarding skill: link https://github.com/SimonBarnett/AWS/blob/main/Lambdas/madeira-awin-clubscan/routes/onboarding.js and document drain loop until remaining=0; pin with tests/fr050e-awin-onboarding-skill.test.js; harvest to SimonBarnett/a-search (bobiverse#3234; context: FR-050e: enriched a-search-awin-onboarding SKILL with clubscan onboarding.js URL + drain-until-remaining=0 playbook; pin test fr050e; PR #446)
