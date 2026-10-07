---
name: a-search-bol
description: >
  Maintain a-search bol live API provider worker. Use in providers/live/bol.
---

# a-search bol (live)

Registry folder `providers/live/bol`. Enabled: live=false, sandbox=false.

## Search path

Live bol API client lands in a later FR.

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_BOL_URL`.
