---
name: a-search-flexoffers
description: >
  Maintain a-search flexoffers local / MSSQL parts provider worker. Use in providers/local/flexoffers.
---

# a-search flexoffers (local)

Registry folder `providers/local/flexoffers`. Enabled: live=false, sandbox=false.

## Search path

SELECT dbo.Parts WHERE Source='flexoffers' (maintainer owns feeds).

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_FLEXOFFERS_URL`.
