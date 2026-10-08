---
name: a-search-kelkoo-onboarding
description: >
  Minimal onboarding stub for disabled registry id `kelkoo`.
  Not enabled - live credential steps UNKNOWN / deferred. Use in
  providers/live/kelkoo or /a-search-kelkoo-onboarding.
---

# a-search Kelkoo onboarding (disabled stub)

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake
>    (`Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search ...` or
>    `POST https://irc.ntsa.uk/bob/v1/intake`). Never leave a finding unfiled.
> 2. Harvest setup playbooks back into **this** skillbook when the source is enabled.
> 3. Never put tokens, passwords, or partner keys in a filing, skill, log, or commit.
> Never park a-search product lessons under bobiverse `harvest/SKILL.md`.

You are in **`providers/live/kelkoo/`**. Registry: **enabled live=false, sandbox=false** — **not enabled** (CAST IRON stay-dark until account details exist; see `docs/phase2-providers.md`).

## Status: UNKNOWN / not enabled

This live network is a **disabled stub** on the shortlist. Price-comparison / shopping offer search API. Credential steps UNKNOWN until a programme account exists.

Full agent-led onboarding (obtain `.env`, sandbox vs live, live selftest) is
**UNKNOWN** until a human enables `kelkoo` in `providers/registry.json` and
files a follow-up FR. Do **not** invent live credential steps or set
`enabled` true from this skill.

## Obtain `.env` (deferred)

Placeholders only — copy from `.env.example` into `providers/live/kelkoo/.env`
(never `entry/.env`, never commit real values):

| Placeholder | Notes |
|-------------|-------|
| `KELKOO_API_KEY` | Deferred until account details exist |
| `SQS_KELKOO_URL` | From stack/env for the chosen `A_SEARCH_ENV` |
| `S3_RESULTS_BUCKET` | Results bucket for this env |
| `A_SEARCH_ENV` | Prefer `sandbox` first when enabling later |

Do not request live API keys while `enabled.live` and `enabled.sandbox` are both false.

## Sandbox vs live

Both disabled (stay-dark). Prefer leaving flags false until credentials exist
and fixture-backed client work lands. Never point sandbox workers at live queues.

## Selftest pointer

Selftest: `docs/endpoint-selftest.md`. Disabled sources are skipped by the
orchestrator — no kelkoo probe required while not enabled.

## After enablement

Expand this stub into a full onboarding skillbook (amazon/ebay FR-060c..d pattern)
and read `.grok/skills/a-search-kelkoo/SKILL.md` for the maintain/runtime path.