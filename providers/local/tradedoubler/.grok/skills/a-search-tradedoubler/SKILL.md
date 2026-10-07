---
name: a-search-tradedoubler
description: >
  Maintain a-search tradedoubler local / MSSQL parts provider worker. Use in providers/local/tradedoubler.
---

# a-search tradedoubler (local)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry folder `providers/local/tradedoubler`. Enabled: live=false, sandbox=false.

## Search path

SELECT dbo.Parts WHERE Source='tradedoubler' (maintainer owns feeds).

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_TRADEDOUBLER_URL`.