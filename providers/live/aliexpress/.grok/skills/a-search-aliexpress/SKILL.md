---
name: a-search-aliexpress
description: >
  Maintain a-search aliexpress live API provider worker. Use in providers/live/aliexpress.
---

# a-search aliexpress (live)

Registry folder `providers/live/aliexpress`. Enabled: live=false, sandbox=false.

## Search path

Live aliexpress API client lands in a later FR.

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_ALIEXPRESS_URL`.
