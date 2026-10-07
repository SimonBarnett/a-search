---
name: a-search-avantlink
description: >
  Maintain a-search avantlink local / MSSQL parts provider worker. Use in providers/local/avantlink.
---

# a-search avantlink (local)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry folder `providers/local/avantlink`. Enabled: live=false, sandbox=false.

## Search path

SELECT dbo.Parts WHERE Source='avantlink' (maintainer owns feeds).

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_AVANTLINK_URL`.