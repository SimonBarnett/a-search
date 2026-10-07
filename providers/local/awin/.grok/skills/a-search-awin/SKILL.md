---
name: a-search-awin
description: >
  Maintain a-search awin local / MSSQL parts provider worker. Use in providers/local/awin.
---

# a-search awin (local)

Registry folder `providers/local/awin`. Enabled: live=true, sandbox=true.

## Search path

SELECT dbo.Parts WHERE Source='awin' (maintainer owns feeds).

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_AWIN_URL`.
