---
name: a-search-shopify-onboarding
description: >
  Minimal onboarding stub for disabled registry id `shopify`.
  Not enabled - live credential steps UNKNOWN / deferred. Use in
  providers/local/shopify or /a-search-shopify-onboarding.
---

# a-search shopify onboarding (disabled stub)

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake
>    (`Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search ...` or
>    `POST https://irc.ntsa.uk/bob/v1/intake`). Never leave a finding unfiled.
> 2. Harvest setup playbooks back into **this** skillbook when the source is enabled.
> 3. Never put tokens, passwords, or partner keys in a filing, skill, log, or commit.
> Never park a-search product lessons under bobiverse `harvest/SKILL.md`.

You are in **`providers/local/shopify/`**. Registry: **enabled live=false, sandbox=false** - **not enabled**.

## Status: UNKNOWN / not enabled

This merchant-store source is a **disabled stub** on the shortlist (FR-607). Full agent-led
onboarding (obtain `.env`, sandbox vs live, live selftest) is **UNKNOWN** until a human
enables `shopify` in `providers/registry.json` and files a follow-up FR.

Do **not** invent live credential steps or enable the source from this skill.

## Obtain `.env` (deferred)

Placeholders only: see `.env.example`. Do not request live API keys while
`enabled.live` and `enabled.sandbox` are both false.

## Sandbox vs live

Both disabled. Prefer leaving flags false until a product FR enables the source.

## Selftest pointer

Selftest: `docs/endpoint-selftest.md`. Disabled sources are skipped by the
orchestrator - no shopify probe required while not enabled.

## After enablement

Expand this stub into a full onboarding skillbook (FR-060c..h pattern) and
read `.grok/skills/a-search-shopify/SKILL.md` for the maintain/runtime path.
