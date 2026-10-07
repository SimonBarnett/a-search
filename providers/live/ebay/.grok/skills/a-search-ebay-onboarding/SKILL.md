---
name: a-search-ebay-onboarding
description: >
  Agent-led eBay Developer / Browse API OAuth onboarding for a-search:
  obtain .env credentials, sandbox vs live, selftest pointer. Use in
  providers/live/ebay. Never commit secrets.
---

# a-search eBay onboarding

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake (or `gh issue`
>    when you have a token). Never leave a finding unfiled.
> 2. Harvest setup playbooks back into **this** skillbook; harvest runtime worker
>    lessons into `a-search-ebay` instead.
> 3. Never put eBay client secrets, refresh tokens, or access tokens in a
>    filing, skill, log, or commit.

You are in **`providers/live/ebay/`**. This skillbook is **setup only** —
it does not implement the Browse API client (see `a-search-ebay`; Browse client
is out of scope for FR-060d).

## Goal

Lead a human through eBay Developer application OAuth so the live worker can
call the **Browse API** in **sandbox** first, then **live**.

## Obtain `.env` credentials

Secrets live only in `providers/live/ebay/.env` (copy from `.env.example`).
Never put them in `entry/.env` or commit real values.

| Placeholder (`.env.example`) | How to obtain |
|------------------------------|---------------|
| `EBAY_CLIENT_ID` | eBay Developer Program → Application Keys → App ID (Client ID) |
| `EBAY_CLIENT_SECRET` | Same keys page → Cert ID (Client Secret); store once, never paste into IRC/chat |
| `EBAY_REFRESH_TOKEN` | OAuth user-consent / refresh token for the scopes the Browse worker needs |
| `EBAY_MARKETPLACE_ID` | Marketplace id (default `EBAY_GB`) |
| `EBAY_ENV` | `sandbox` while onboarding; `production` only after smoke OK |
| `A_SEARCH_ENV` | `sandbox` while onboarding; `live` only after smoke OK |
| `SQS_EBAY_URL` | From stack/env for this `A_SEARCH_ENV` (see `docs/environments.md`) |
| `S3_RESULTS_BUCKET` | Results bucket for this env |

Steps (agent-led):

1. Confirm an eBay Developer account and create (or select) an application.
2. Create **sandbox** keys first; map App ID / Cert ID into `.env` names above.
3. Complete OAuth consent to obtain a refresh token with Browse-related scopes;
   put it in `EBAY_REFRESH_TOKEN` only in `.env`.
4. Set `A_SEARCH_ENV=sandbox` and `EBAY_ENV=sandbox` plus sandbox queue/bucket URLs.
5. Confirm `.env` is gitignored; `git status` must not show secret files.
6. Do not log or echo secret values when verifying.

## Sandbox vs live

| | Sandbox | Live |
|-|---------|------|
| `A_SEARCH_ENV` | `sandbox` | `live` |
| `EBAY_ENV` | `sandbox` | `production` |
| Credentials | Sandbox App ID / Cert ID / refresh token | Production keys + refresh token |
| Queues | `SQS_EBAY_URL` for sandbox | Live queue URLs only |
| Registry | Keep `ebay` enabled; never point sandbox workers at live queues | After sandbox smoke |

Refuse cross-env jobs (`message.env` must equal `A_SEARCH_ENV` — maintain skill).

## Selftest pointer

Selftest route/docs are FR-059 family (`docs/endpoint-selftest.md` / selftest
route) — **selftest TBD** until that lands.

Until then, after credentials are in `.env`:

1. Run fixture/unit smoke: `npm test` (see `tests/ebay-scaffold.test.js` —
   no live keys required for scaffold fixtures).
2. Optional: sandbox worker smoke with a single sandbox queue message (never
   live) once queues exist for this env.

Onboarding does **not** implement selftest or the Browse client; it only points here.

## After onboarding

Read `.grok/skills/a-search-ebay/SKILL.md` for runtime worker, rate limits,
and S3 results path.