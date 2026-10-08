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

## Normalize + upsert (FR-106)

- `src/normalize.js` — Stores product → Parts staging columns (+ ContentHash).
- `src/upsert.js` — `upsertWixParts` / `wixUpsertPartsHook` wraps maintainer set-based MERGE; inject clear/bulkLoad/runMerge for deploy.
- Fixture: `fixtures/products-ok.json`. Pin: `tests/fr106-wix-normalize-upsert.test.js`.
- Out of scope: registry enable, live merchant tokens, worker query path (FR-107).

## Search path

SELECT dbo.Parts WHERE Source='wix' (maintainer owns store sync / feeds).

## Worker stub

`src/worker.js` exports `run(msg)` (FR-607). Still a stub until FR-107.

## Env

See `.env.example`. Queue env: `SQS_WIX_URL`.
