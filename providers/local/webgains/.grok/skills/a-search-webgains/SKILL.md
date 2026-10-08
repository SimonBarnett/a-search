---
name: a-search-webgains
description: >
  Maintain a-search webgains local / MSSQL parts provider worker. Use in providers/local/webgains.
---

# a-search webgains (local)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry folder `providers/local/webgains`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark -- see `docs/phase2-providers.md`).

## Search path (FR-086)

`src/queryParts.js` -- parameterized `SELECT` from `dbo.Parts` where
`Source='webgains'` and `DeletedAt IS NULL`. Injectable `connect` for unit tests
(no live SQL). Stay-dark.

## Worker (FR-086)

`src/worker.js` `run(msg, deps)` -- `assertWorkerEnv` -> `defaultQueryParts` ->
`normalizePart` (+ `buildTrackedUrl` with `WEBGAINS_CAMPAIGN_ID` /
`wgcampaignid`) -> `writeResults`. Optional `handler` for SQS Records.
Stay-dark; no "not wired" stub on the happy path.

## Env

See `.env.example`. Queue env: `SQS_WEBGAINS_URL`.
MSSQL: `MSSQL_SERVER`, `MSSQL_DATABASE`, `MSSQL_USER` / `MSSQL_PASSWORD`
(or `MSSQL_TRUSTED_CONNECTION`). Account: `WEBGAINS_CAMPAIGN_ID`.
