---
name: a-search-rakuten-onboarding
description: >
  Agent-led Rakuten Product Search / affiliate onboarding for a-search:
  obtain .env credentials (application key, affiliate/site ids), sandbox vs
  live, rate-limit awareness, selftest pointer. Use in providers/live/rakuten
  or /a-search-rakuten-onboarding. Never commit secrets. Search client OOS.
---

# a-search Rakuten onboarding

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake (or `gh issue`
>    when you have a token). Never leave a finding unfiled.
> 2. Harvest setup playbooks back into **this** skillbook; harvest runtime worker
>    lessons into `a-search-rakuten` instead.
> 3. Never put Rakuten application keys, affiliate ids, site ids, or tokens in a
>    filing, skill, log, or commit.

You are in **`providers/live/rakuten/`**. This skillbook is **setup only** —
it does not implement the Product Search client (see `a-search-rakuten`; search
client is out of scope for FR-060e).

## Goal

Lead a human through Rakuten affiliate / Product Search credential setup so the
live worker can call Product Search (XML) in **sandbox** first, then **live**,
while honouring **rate limits**.

## Obtain `.env` credentials (affiliate keys)

Secrets live only in `providers/live/rakuten/.env` (copy from `.env.example`).
Never put them in `entry/.env` or commit real values.

| Placeholder (`.env.example`) | How to obtain |
|------------------------------|---------------|
| `RAKUTEN_APPLICATION_KEY` | Rakuten affiliate / Product Search console — application key (required) |
| `RAKUTEN_AFFILIATE_ID` | Optional affiliate id for attribution on Product Search |
| `RAKUTEN_SITE_ID` | Tracked-link site/mid for `buildTrackedUrl` (FR-057); never commit a real id |
| `RAKUTEN_ENDPOINT` | API root (default `https://api.rakuten.com/`) |
| `A_SEARCH_ENV` | `sandbox` while onboarding; `live` only after smoke OK |
| `SQS_RAKUTEN_URL` | From stack/env for this `A_SEARCH_ENV` (see `docs/environments.md`) |
| `S3_RESULTS_BUCKET` | Results bucket for this env |

Steps (agent-led):

1. Confirm a Rakuten affiliate / publisher account for the target marketplace.
2. Create or retrieve the **application key**; map into `RAKUTEN_APPLICATION_KEY`.
3. Optionally set `RAKUTEN_AFFILIATE_ID` and `RAKUTEN_SITE_ID` for attribution / tracked links.
4. Set `A_SEARCH_ENV=sandbox` and sandbox queue/bucket URLs first.
5. Confirm `.env` is gitignored; `git status` must not show secret files.
6. Do not log or echo secret values when verifying.

## Rate limits (onboarding awareness)

Rakuten enforces **per-application-key** rate limits. During onboarding:

1. Prefer fixture/unit smoke before any live Product Search call.
2. When probing live/sandbox, use a **single** low-volume request; never tight-loop.
3. On **429** / **503**, honour `Retry-After` / documented QPS — back off; do not
   rotate keys to evade limits.
4. Point the human at `a-search-rakuten` for runtime backoff playbook after setup.
5. SQS `batchSize: 1` / registry maxConcurrency (FR-058) already caps fan-out —
   do not raise concurrency while validating credentials.

## Sandbox vs live

| | Sandbox | Live |
|-|---------|------|
| `A_SEARCH_ENV` | `sandbox` | `live` |
| Credentials | Same application key pattern; **sandbox queues only** | Production queues only after smoke |
| Queues | `SQS_RAKUTEN_URL` / sandbox URLs | Live queue URLs only |
| Registry | Keep `rakuten` enabled; never point sandbox workers at live queues | After sandbox smoke |

Refuse cross-env jobs (`message.env` must equal `A_SEARCH_ENV` — maintain skill).

## Selftest pointer

Selftest route/docs are FR-059 family (`docs/endpoint-selftest.md`,
`GET`/`POST` `/selftest`, `providers/live/rakuten/src/selftestProbe.js`).

Until deploying selftest:

1. Run fixture/unit smoke: `npm test` (see `tests/rakuten-search.test.js` /
   `tests/fr059h-rakuten-selftest-probe.test.js` with injectable `httpRequest` —
   no live keys required for fixtures).
2. Optional: sandbox worker smoke with a single sandbox queue message (never
   live) once queues exist for this env.

Onboarding does **not** implement selftest or the Product Search client; it only
points here.

## After onboarding

Read `.grok/skills/a-search-rakuten/SKILL.md` for runtime worker, XML parse,
rate-limit backoff, and S3 results path.

Contract: `docs/provider-onboarding-skills.md` (FR-060a).
