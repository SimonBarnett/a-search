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
`rateLimit`: maxConcurrency 1 / minIntervalMs 250 (FR-096).

## Search path (FR-095)

SELECT dbo.Parts WHERE Source='flexoffers' AND DeletedAt IS NULL (maintainer owns feeds).
`src/queryParts.js` when present -- injectable `connect` (no live SQL). Stay-dark.

## Worker

`src/worker.js` exports `run(msg[, deps])`. Stay-dark.

## Selftest + pacing (FR-096)

`src/selftestProbe.js` -- MSSQL Parts reachability (injectable `connect`) or
`FLEXOFFERS_API_TOKEN` feed-ready; returns `{ ok, source, latencyMs, error? }`
for `/selftest`. Registry `rateLimit`: `maxConcurrency: 1`, `minIntervalMs: 250`
(stay-dark; do not flip `enabled`).

## Env

See `.env.example`. Queue env: `SQS_FLEXOFFERS_URL`. Placeholders only:
`MSSQL_*`, `FLEXOFFERS_AFFILIATE_ID=`.
Selftest placeholder: `FLEXOFFERS_API_TOKEN=`.
