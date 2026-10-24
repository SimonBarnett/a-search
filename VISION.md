# Vision: a-search (MRB pointer)

Canonical LOCKED vision pack: **[docs/vision.md](docs/vision.md)**
(validate with `npm run validate:vision`). This root file exists so hostile
MRB seats that look for `VISION.md` at the repo root can quote product intent
without falling back to issue text alone (FR #4572).

## Objective (LOCKED)

One JWT-authenticated HTTP search call fans out work to every enabled live
marketplace provider and every enabled local MSSQL-backed part source, each
isolated in its own folder with its own `.env` and skillbook --- affiliate
search contract for Club Madeira / a-search.

## Live results, a-clubs, and DLQ (MRB themes)

- Live providers write a-clubs results under `a-clubs/{host}/{guid}/IN/`
  (`IN/{searchid}-{source}.json`) via `writeLiveProviderInResult` (FR #4038).
- Paced SQS consumers (`batchSize: 1`, reserved concurrency 1) back off on
  real **429** / gateway 5xx; provider API failures must **not** write an IN
  file (FR #4769). Non-retryable / permanent client faults
  (`creators_not_eligible`, `rakuten_invalid_context`, `cj_not_authorised`,
  other `nonRetryable` 4xx) **SendMessage to the provider DLQ and delete the
  source message on the first failure** (FR #4782) --- do not wait for
  maxReceiveCount. A successful call that returns 0 matches writes **no** IN file
  (FR #4823: log `provider_done ... products=0`, ack normally).
- Per-source secrets stay isolated; fatals intake to `SimonBarnett/a-search`.

See Success rows S1-S20, Architecture, and Environments in `docs/vision.md`.
