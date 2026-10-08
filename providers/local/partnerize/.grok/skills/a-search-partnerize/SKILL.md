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

## Harvested lessons (relocated from bobiverse, 2026-10-08)

Misfiled a-search harvests from SimonBarnett/bobiverse, moved here so no lesson is lost.
MRB: keep, reword or trim; twins are listed once with every source.

- a-search Phase-2 stay-dark local selftest: add selftestProbe with injectable MSSQL connect (or feed token) + registry rateLimit; keep enabled false; when FR-058b hardcodes the no-rateLimit id, retarget it to the next stub without rateLimit (e.g. webgains after partnerize). (bobiverse#3404, bobiverse#3406; context: FR-084 partnerize selftestProbe + rateLimit stay-dark; PR #728 Closes #637)
