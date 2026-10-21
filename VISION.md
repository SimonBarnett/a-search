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
  real **429**; provider API failures (4xx auth/eligibility/client, permanent
  vendor faults, 5xx) must **not** write an IN file --- they fail the receive
  into the provider **DLQ** with a clear CloudWatch log (FR #4769). A successful
  call that returns 0 matches still writes an empty-products IN.
- Per-source secrets stay isolated; fatals intake to `SimonBarnett/a-search`.

See Success rows S1-S20, Architecture, and Environments in `docs/vision.md`.
