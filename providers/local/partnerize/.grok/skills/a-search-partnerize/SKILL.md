---
name: a-search-partnerize
description: >
  Maintain a-search partnerize local / MSSQL parts provider worker. Use in providers/local/partnerize.
---

# a-search partnerize (local)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry folder `providers/local/partnerize`. Enabled: live=false, sandbox=false.

## Search path

SELECT dbo.Parts WHERE Source='partnerize' (maintainer owns feeds).

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_PARTNERIZE_URL`.