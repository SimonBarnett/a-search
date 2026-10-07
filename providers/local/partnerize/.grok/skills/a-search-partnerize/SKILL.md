---
name: a-search-partnerize
description: >
  Maintain a-search partnerize local / MSSQL parts provider worker. Use in providers/local/partnerize.
---

# a-search partnerize (local)

Registry folder `providers/local/partnerize`. Enabled: live=false, sandbox=false.

## Search path

SELECT dbo.Parts WHERE Source='partnerize' (maintainer owns feeds).

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_PARTNERIZE_URL`.
