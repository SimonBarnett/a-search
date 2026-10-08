---
name: a-search-wix
description: >
  Maintain a-search wix local / MSSQL parts provider worker. Use in providers/local/wix.
---

# a-search wix (local)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry folder `providers/local/wix`. Enabled: live=false, sandbox=false (stay dark until account details exist).

## Search path

SELECT dbo.Parts WHERE Source='wix' (maintainer owns store sync / feeds).

## Worker (FR-107)

`src/worker.js` + `src/queryParts.js`: injectable MSSQL `defaultQueryParts` → normalize Parts → `writeResults`.
Relative product Urls resolve against `WIX_STORE_URL`; tracked links stamp `WIX_AFFILIATE_ID` as `sid`.
Pin: `tests/fr107-wix-worker.test.js`. Catalogue (FR-105) and normalize/upsert (FR-106) are separate.

## Env

See `.env.example` (`MSSQL_*`, `WIX_STORE_URL`, `WIX_AFFILIATE_ID`). Queue env: `SQS_WIX_URL`.