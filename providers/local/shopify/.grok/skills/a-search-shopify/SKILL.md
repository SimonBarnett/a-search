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

Registry folder `providers/local/shopify`. Enabled: live=false, sandbox=false.

## Search path

SELECT dbo.Parts WHERE Source='shopify' (maintainer owns store sync / feeds).

## Worker stub

`src/worker.js` exports `run(msg)` (FR-607).

## Env

See `.env.example`. Queue env: `SQS_SHOPIFY_URL`.
