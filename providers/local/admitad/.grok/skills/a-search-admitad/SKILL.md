---
name: a-search-admitad
description: >
  Maintain a-search admitad local / MSSQL parts provider worker. Use in providers/local/admitad.
---

# a-search admitad (local)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry folder `providers/local/admitad`. Enabled: live=false, sandbox=false.

## Search path

SELECT dbo.Parts WHERE Source='admitad' (maintainer owns feeds).

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_ADMITAD_URL`.