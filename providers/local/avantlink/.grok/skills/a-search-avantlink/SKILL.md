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

Registry folder `providers/local/avantlink`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark -- see `docs/phase2-providers.md`).
`rateLimit`: maxConcurrency 1 / minIntervalMs 250 (FR-099).

## Search path (FR-098)

SELECT dbo.Parts WHERE Source='avantlink' AND DeletedAt IS NULL (maintainer owns feeds).
`src/queryParts.js` -- `defaultQueryParts` / `mssqlConfigFromEnv` with injectable
`connect` (no live SQL). Stay-dark.

## Worker (FR-098)

`src/worker.js` exports `run(msg, deps)` / `handler` / `normalizePart`.
Reads Parts via queryParts, normalizes, `buildTrackedUrl` with `AVANTLINK_AFFILIATE_ID`
-> query param `avad`, then `writeResults`. Stay-dark; no "not wired" stub on the happy path.

## Selftest + pacing (FR-099)

`src/selftestProbe.js` -- MSSQL Parts reachability (injectable `connect`) or
`AVANTLINK_API_TOKEN` feed-ready; returns `{ ok, source, latencyMs, error? }`
for `/selftest`. Registry `rateLimit`: `maxConcurrency: 1`, `minIntervalMs: 250`
(stay-dark; do not flip `enabled`).

## Env

See `.env.example`. Queue env: `SQS_AVANTLINK_URL`. Placeholders only:
`MSSQL_*`, `AVANTLINK_AFFILIATE_ID=`.
Selftest placeholder: `AVANTLINK_API_TOKEN=`.
