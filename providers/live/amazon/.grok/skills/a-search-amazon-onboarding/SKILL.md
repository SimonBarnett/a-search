---
name: a-search-amazon-onboarding
description: >
  Agent-led Amazon Associates / PA-API (or Creators) onboarding for a-search:
  obtain .env credentials, sandbox vs live, selftest pointer. Use in
  providers/live/amazon. Never commit secrets.
---

# a-search Amazon onboarding

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake (or `gh issue`
>    when you have a token). Never leave a finding unfiled.
> 2. Harvest setup playbooks back into **this** skillbook; harvest runtime worker
>    lessons into `a-search-amazon` instead.
> 3. Never put Amazon access keys, secret keys, partner tags, or tokens in a
>    filing, skill, log, or commit.

You are in **`providers/live/amazon/`**. This skillbook is **setup only** —
it does not implement the SearchItems client (see `a-search-amazon`).

## Goal

Lead a human through Amazon Associates / Product Advertising API (PA-API)
credential setup so the live worker can call SearchItems in **sandbox** first,
then **live**.

Creators API is an alternate path only if Associates/PA-API is unavailable for
the marketplace; prefer PA-API + partner tag for this product.

## Obtain `.env` credentials

Secrets live only in `providers/live/amazon/.env` (copy from `.env.example`).
Never put them in `entry/.env` or commit real values.

| Placeholder (`.env.example`) | How to obtain |
|------------------------------|---------------|
| `AMAZON_ACCESS_KEY` | Amazon Associates → Tools → Product Advertising API → create access key |
| `AMAZON_SECRET_KEY` | Same console; store once, never paste into IRC/chat |
| `AMAZON_PARTNER_TAG` | Associates store/partner tag for the target marketplace |
| `AMAZON_HOST` | Marketplace host (default `webservices.amazon.co.uk`) |
| `AMAZON_REGION` | Signing region (default `eu-west-1`) |
| `A_SEARCH_ENV` | `sandbox` while onboarding; `live` only after smoke OK |
| `SQS_AMAZON_URL` | From stack/env for this `A_SEARCH_ENV` (see `docs/environments.md`) |
| `S3_RESULTS_BUCKET` | Results bucket for this env |

Steps (agent-led):

1. Confirm Associates account is approved for the target marketplace.
2. Enable PA-API and create credentials; map into `.env` names above.
3. Set `A_SEARCH_ENV=sandbox` and sandbox queue/bucket URLs first.
4. Confirm `.env` is gitignored; `git status` must not show secret files.
5. Do not log or echo secret values when verifying.

## Sandbox vs live

| | Sandbox | Live |
|-|---------|------|
| `A_SEARCH_ENV` | `sandbox` | `live` |
| Credentials | Prefer sandbox/dev tag + host if Amazon provides a split; otherwise same keys but **sandbox queues only** | Production partner tag + host |
| Queues | `SQS_AMAZON_URL` / `*_SANDBOX_URL` for sandbox | Live queue URLs only |
| Registry | Keep `amazon` enabled; never point sandbox workers at live queues | After sandbox smoke |

Refuse cross-env jobs (`message.env` must equal `A_SEARCH_ENV` — maintain skill).

## Selftest pointer

Selftest route/docs are FR-059 family (`docs/endpoint-selftest.md` / selftest
route) — **selftest TBD** until that lands.

Until then, after credentials are in `.env`:

1. Run fixture/unit smoke: `npm test` (see `tests/amazon-search.test.js` with
   injectable `httpRequest` — no live keys required for fixtures).
2. Optional: sandbox worker smoke with a single sandbox queue message (never
   live) once queues exist for this env.

Onboarding does **not** implement selftest; it only points here.

## After onboarding

Read `.grok/skills/a-search-amazon/SKILL.md` for runtime worker, rate limits,
and S3 results path.
