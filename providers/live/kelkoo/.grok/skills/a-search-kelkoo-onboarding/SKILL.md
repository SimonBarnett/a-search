---
name: a-search-kelkoo-onboarding
description: >
  Kelkoo onboarding and credential setup for enabled registry id `kelkoo`. Use in
  providers/live/kelkoo or /a-search-kelkoo-onboarding.
---

# a-search Kelkoo onboarding

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake
>    (`Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search ...` or
>    `POST https://irc.ntsa.uk/bob/v1/intake`). Never leave a finding unfiled.
> 2. Harvest setup playbooks back into **this** skillbook when the source is enabled.
> 3. Never put tokens, passwords, or partner keys in a filing, skill, log, or commit.
> Never park a-search product lessons under bobiverse `harvest/SKILL.md`.

You are in **`providers/live/kelkoo/`**. Registry flags are enabled for live
and sandbox. CDK only includes Kelkoo in entry fan-out when the provider's
bundled `.env` contains both required credential keys. See
`docs/phase2-providers.md` for program rollout context.

## Credential setup

Kelkoo searches shopping offers through its publisher API. An authorized
operator supplies the account credentials; do not request, copy into chat, or
write credential values to git, logs, skillbooks, or intake filings.

Create the ignored file `providers/live/kelkoo/.env` from `.env.example` and
fill only from the authorized credential source:

| Placeholder | Notes |
|-------------|-------|
| `KELKOO_API_KEY` | Required by the Shopping API client |
| `KELKOO_PUBLISHER_ID` | Required for tracked landing URLs |
| `KELKOO_COUNTRY` | Optional country code; defaults to `uk` |
| `SQS_KELKOO_URL` | Queue URL for the worker environment |
| `S3_RESULTS_BUCKET` | Results bucket for the worker environment |
| `A_SEARCH_ENV` | Set to the worker's environment |

Never commit `.env`. CDK's synth check reads key names and whether values are
non-empty; warning output does not include values. If the file or either
required key is missing, CDK retains Kelkoo queue/worker resources but omits
the entry queue URL, disabling Kelkoo fan-out until the credential file is
complete.

## Sandbox vs live

The registry enables both environments. Use the credentials and queue for the
intended environment only; never point sandbox workers at live queues. Deploy
or run a live smoke test only with Simon's go.

## Selftest pointer

Selftest: `docs/endpoint-selftest.md`. A source omitted from entry fan-out
because its credential file is incomplete will not receive searches.

For search and worker runtime details, read `.grok/skills/a-search-kelkoo/SKILL.md`.
