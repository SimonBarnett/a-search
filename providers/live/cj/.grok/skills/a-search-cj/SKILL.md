---
name: a-search-cj
description: >
  Maintain a-search cj live API provider worker. Use in providers/live/cj.
---

# a-search cj (live)

Registry folder `providers/live/cj`. Enabled: live=true, sandbox=true.

## Search path

Live cj API client lands in a later FR.

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_CJ_URL`.
