---
name: a-search-tradedoubler
description: >
  Maintain a-search tradedoubler local / MSSQL parts provider worker. Use in providers/local/tradedoubler.
---

# a-search tradedoubler (local)

Registry folder `providers/local/tradedoubler`. Enabled: live=false, sandbox=false.

## Search path

SELECT dbo.Parts WHERE Source='tradedoubler' (maintainer owns feeds).

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_TRADEDOUBLER_URL`.
