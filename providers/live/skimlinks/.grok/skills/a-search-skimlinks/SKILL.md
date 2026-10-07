---
name: a-search-skimlinks
description: >
  Maintain a-search skimlinks live API provider worker. Use in providers/live/skimlinks.
---

# a-search skimlinks (live)

Registry folder `providers/live/skimlinks`. Enabled: live=false, sandbox=false.

## Search path

Live skimlinks API client lands in a later FR.

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_SKIMLINKS_URL`.
