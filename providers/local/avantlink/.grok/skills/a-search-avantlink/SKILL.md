---
name: a-search-avantlink
description: >
  Maintain a-search avantlink local / MSSQL parts provider worker. Use in providers/local/avantlink.
---

# a-search avantlink (local)

Registry folder `providers/local/avantlink`. Enabled: live=false, sandbox=false.

## Search path

SELECT dbo.Parts WHERE Source='avantlink' (maintainer owns feeds).

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_AVANTLINK_URL`.
