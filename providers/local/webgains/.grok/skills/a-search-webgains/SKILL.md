---
name: a-search-webgains
description: >
  Maintain a-search webgains local / MSSQL parts provider worker. Use in providers/local/webgains.
---

# a-search webgains (local)

Registry folder `providers/local/webgains`. Enabled: live=false, sandbox=false.

## Search path

SELECT dbo.Parts WHERE Source='webgains' (maintainer owns feeds).

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_WEBGAINS_URL`.
