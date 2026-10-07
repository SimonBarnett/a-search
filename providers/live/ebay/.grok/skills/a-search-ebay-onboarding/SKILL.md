---
name: a-search-ebay-onboarding
description: >
  Agent-led onboarding for a-search registry id `ebay` (obtain .env,
  sandbox vs live, selftest pointer). Expand under FR-060 provider bodies.
  Use in providers/live/ebay or /a-search-ebay-onboarding.
---

# a-search ebay onboarding

> **CAST IRON:** Never commit provider secrets. Keep them in
> `providers/live/ebay/.env` only. Harvest setup lessons into this skillbook;
> file gaps via intake to `SimonBarnett/a-search`.

Stub for **FR-060b** layout pin. Full prose lands in the matching FR-060
provider onboarding FR. Contract: `docs/provider-onboarding-skills.md`
(FR-060a) once merged — path pattern `a-search-<id>-onboarding`.

## Required sections (fill in provider FR)

1. Obtain `.env` account credentials (map to `.env.example`)
2. Sandbox vs live
3. Selftest pointer (FR-059 family when live)