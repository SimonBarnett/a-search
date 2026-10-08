---
name: a-search-cj-onboarding
description: >
  Agent-led CJ Affiliate GraphQL onboarding for a-search: obtain .env
  credentials (API token, company/website property ids), sandbox vs live,
  selftest pointer. Use in providers/live/cj or /a-search-cj-onboarding.
  Never commit secrets. GraphQL client OOS.
---

# a-search CJ onboarding

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake (or `gh issue`
>    when you have a token). Never leave a finding unfiled.
> 2. Harvest setup playbooks back into **this** skillbook; harvest runtime worker
>    lessons into `a-search-cj` instead.
> 3. Never put CJ API tokens, company ids, website ids, or GraphQL secrets in a
>    filing, skill, log, or commit.

You are in **`providers/live/cj/`**. This skillbook is **setup only** —
it does not implement the GraphQL Product Search client (see `a-search-cj`;
GraphQL client is out of scope for FR-060f).

## Goal

Lead a human through CJ Affiliate developer token + property id setup so the
live worker can call **`ads.api.cj.com`** GraphQL in **sandbox** first, then
**live**.

## Obtain `.env` credentials (GraphQL token + property ids)

Secrets live only in `providers/live/cj/.env` (copy from `.env.example`).
Never put them in `entry/.env` or commit real values.

| Placeholder (`.env.example`) | How to obtain |
|------------------------------|---------------|
| `CJ_API_TOKEN` | CJ Affiliate / Developers — personal access token for GraphQL (required) |
| `CJ_GRAPHQL_URL` | Default `https://ads.api.cj.com/query` unless CJ documents another host |
| `CJ_COMPANY_ID` | Optional company/property id for `products(companyId: …)` scoping |
| `CJ_WEBSITE_ID` | Tracked-link website/sid for `buildTrackedUrl` (FR-057); never commit a real id |
| `A_SEARCH_ENV` | `sandbox` while onboarding; `live` only after smoke OK |
| `SQS_CJ_URL` | From stack/env for this `A_SEARCH_ENV` (see `docs/environments.md`) |
| `S3_RESULTS_BUCKET` | Results bucket for this env |

Steps (agent-led):

1. Confirm a CJ Affiliate publisher account and developer access.
2. Create a GraphQL **personal access token**; map into `CJ_API_TOKEN` only in `.env`.
3. Optionally set `CJ_COMPANY_ID` (product company scope) and `CJ_WEBSITE_ID` (tracked links).
4. Set `A_SEARCH_ENV=sandbox` and sandbox queue/bucket URLs first.
5. Confirm `.env` is gitignored; `git status` must not show secret files.
6. Do not log or echo token values when verifying.

## Sandbox vs live

| | Sandbox | Live |
|-|---------|------|
| `A_SEARCH_ENV` | `sandbox` | `live` |
| Credentials | Same token pattern; **sandbox queues only** | Production queues only after smoke |
| Queues | `SQS_CJ_URL` for sandbox | Live queue URLs only |
| Registry | Keep `cj` enabled; never point sandbox workers at live queues | After sandbox smoke |

Refuse cross-env jobs (`message.env` must equal `A_SEARCH_ENV` — maintain skill).

## Selftest pointer

Selftest route/docs are FR-059 family (`docs/endpoint-selftest.md`,
`GET`/`POST` `/selftest`, `providers/live/cj/src/selftestProbe.js`).

Until deploying selftest:

1. Run fixture/unit smoke: `npm test` (see `tests/cj-search.test.js` /
   `tests/fr059i-cj-selftest-probe.test.js` with injectable `httpRequest` —
   no live token required for fixtures).
2. Optional: sandbox worker smoke with a single sandbox queue message (never
   live) once queues exist for this env.

Onboarding does **not** implement selftest or the GraphQL client; it only
points here.

## After onboarding

Read `.grok/skills/a-search-cj/SKILL.md` for runtime worker, GraphQL query
shape, and S3 results path.

Contract: `docs/provider-onboarding-skills.md` (FR-060a).
