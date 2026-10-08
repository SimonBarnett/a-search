---
name: a-search-shopify
description: >
  Maintain a-search shopify local / MSSQL parts provider worker. Use in providers/local/shopify.
---

# a-search shopify (local)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry folder `providers/local/shopify`. Enabled: live=false, sandbox=false (stay dark until account details exist).

## Selftest + rateLimit (FR-104)

- `src/selftestProbe.js` — injectable MSSQL Parts probe; `SHOPIFY_ACCESS_TOKEN` is feed-ready fallback when SQL is missing/unreachable.
- Registry `rateLimit`: `maxConcurrency=1`, `minIntervalMs=250` (pacing only; does not enable fan-out).
- Pin: `tests/fr104-shopify-selftest-probe.test.js`.

## Search path

SELECT dbo.Parts WHERE Source='shopify' (maintainer owns store sync / feeds).

## Worker stub

`src/worker.js` exports `run(msg)` (FR-607 / FR-103 queryParts path lands separately).

## Env

See `.env.example`. Queue env: `SQS_SHOPIFY_URL`.
