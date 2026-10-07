---
name: a-search-admitad
description: >
  Maintain a-search admitad local / MSSQL parts provider worker. Use in providers/local/admitad.
---

# a-search admitad (local)

Registry folder `providers/local/admitad`. Enabled: live=false, sandbox=false.

## Search path

SELECT dbo.Parts WHERE Source='admitad' (maintainer owns feeds).

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_ADMITAD_URL`.
