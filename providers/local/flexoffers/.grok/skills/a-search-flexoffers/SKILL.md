---
name: a-search-flexoffers
description: >
  Maintain a-search flexoffers local / MSSQL parts provider worker. Use in providers/local/flexoffers.
---

# a-search flexoffers (local)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry folder `providers/local/flexoffers`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark -- see `docs/phase2-providers.md`).

## Search path (FR-095)

SELECT dbo.Parts WHERE Source='flexoffers' AND DeletedAt IS NULL (maintainer owns feeds).
`src/queryParts.js` -- `defaultQueryParts` / `mssqlConfigFromEnv` with injectable
`connect` (no live SQL). Stay-dark.

## Worker (FR-095)

`src/worker.js` exports `run(msg, deps)` / `handler` / `normalizePart`.
Reads Parts via queryParts, normalizes, `buildTrackedUrl` with `FLEXOFFERS_AFFILIATE_ID`
-> query param `foid`, then `writeResults`. Stay-dark; no "not wired" stub on the happy path.

## Env

See `.env.example`. Queue env: `SQS_FLEXOFFERS_URL`. Placeholders only:
`MSSQL_*`, `FLEXOFFERS_AFFILIATE_ID=`.
