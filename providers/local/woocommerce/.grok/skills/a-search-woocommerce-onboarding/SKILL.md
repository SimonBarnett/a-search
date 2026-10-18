---
name: a-search-woocommerce-onboarding
description: >
  Onboarding notes for registry id `woocommerce` (merchant). Enabled both
  envs (FR-180). Use in providers/local/woocommerce or /a-search-woocommerce-onboarding.
---

# a-search woocommerce onboarding

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake
>    (`Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search ...` or
>    `POST https://irc.ntsa.uk/bob/v1/intake`). Never leave a finding unfiled.
> 2. Harvest setup playbooks back into **this** skillbook when credentials change.
> 3. Never put tokens, passwords, or partner keys in a filing, skill, log, or commit.
> Never park a-search product lessons under bobiverse `harvest/SKILL.md`.

You are in **`providers/local/woocommerce/`**. Registry: **enabled live=true, sandbox=true (FR-180)** as **merchant** (`merchantConnect: true`).

## Status: enabled (FR-180)

WooCommerce is an enabled merchant source. App-level selftest fallback secrets
(`WOOCOMMERCE_CONSUMER_KEY` / `_SECRET` / `STORE_URL`) live in Secrets Manager
(`a-search/{env}/providers/woocommerce/app`). Per-shop REST keys remain the
vault / Shops path (FR-235 / FR-238 / FR-240).

Do **not** invent live credential values in git. Fill deploy secrets from the
operator secret store only.

## Obtain `.env`

Placeholders only: see `.env.example` (no `WOOCOMMERCE_AFFILIATE_ID` — merchant
URLs stay plain absolute). Queue env: `SQS_WOOCOMMERCE_URL`.

## Sandbox vs live

Both enabled. Prefer sandbox for first selftest / fixture smoke.

## Selftest pointer

Selftest: `docs/endpoint-selftest.md`. Probe path: `src/selftestProbe.js`
(MSSQL Parts reachability or consumer-key feed-ready).

## Runtime skill

Read `.grok/skills/a-search-woocommerce/SKILL.md` for the maintain/runtime path.
