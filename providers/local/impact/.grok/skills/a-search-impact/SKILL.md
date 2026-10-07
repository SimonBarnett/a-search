---
name: a-search-impact
description: >
  Maintain a-search impact local / MSSQL parts provider worker. Use in providers/local/impact.
---

# a-search impact (local)

Registry folder `providers/local/impact`. Enabled: live=true, sandbox=true.

## Search path

SELECT dbo.Parts WHERE Source='impact' (maintainer owns feeds).

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_IMPACT_URL`.
