# Local onboarding agents (FR-049a)

Each **enabled local** registry source (`kind: local`) gets an onboarding
agent CWD and a scheduled runner that **drains work until done**, then
**self-exits** (no forever idle loop). This is clubscan parity for
Awin-style join / signup processing, ported into a-search.

Skillbook setup for humans (`.env` obtain steps) stays in
`docs/provider-onboarding-skills.md` (FR-060a). This doc is the **runner
contract**: schedule, drain loop, signup feed.

## Legacy reference (read-only)

Clubscan daily Awin onboarding + report:

https://github.com/SimonBarnett/AWS/tree/main/Lambdas/madeira-awin-clubscan

Especially `routes/onboarding.js` and EventBridge rule `Awin-Onboarding`.
a-search must match the **drain-until-empty** and **signup row** intent;
HTML email may remain external until FR-052 cutover.

## Layout (per local id)

```text
providers/local/<id>/onboarding/
  AGENTS.md
  .grok/skills/a-search-<id>-onboarding/SKILL.md   # CAST IRON harvest
  src/run.js                                       # runOnce(deps)
  .env.example
```

Minimum enabled locals: **awin**, **impact**. Disabled locals: stub folder
or explicit defer note (FR-049 scaffold).

## `runOnce` contract

```js
// providers/local/<id>/onboarding/src/run.js
async function runOnce(deps) {
  return {
    processed: number,   // items handled this tick
    remaining: number,   // work still queued after this tick
    signups: Signup[],   // new merchant / join rows for daily report
  };
}
```

### Signup object (clubscan-aligned minimum)

| Field | Type | Meaning |
|-------|------|---------|
| `source` | string | Registry id (`awin`, `impact`, …) |
| `env` | `live` \| `sandbox` | Isolation stamp |
| `merchantId` | string | Provider merchant / advertiser id |
| `merchantName` | string | Display name |
| `signedUpAt` | string (ISO-8601) | When the join/signup was recorded |
| `status` | string | e.g. `joined`, `pending`, `rejected` |

Optional later (FR-052): campaign id, feed key, last-24h sales pointer.
Persist shape is LOCKED in FR-052 (`docs/daily-report-signups.md` when filed).

## Drain-until-done (`shared/onboarding/drain.js`)

Orchestrator loops `runOnce` until empty:

1. Call `runOnce(deps)` → `{ processed, remaining, signups }`
2. Accumulate `signups` for the report feed
3. If **`remaining === 0`**, **exit 0** (schedule complete)
4. Else continue until `remaining === 0` or **max-iterations** safety cap
5. Cap hit with `remaining > 0` → non-zero exit (or intake fatal) — never
   spin forever

```text
remaining=0  →  process exit 0  (success / drained)
```

EventBridge (FR-056) invokes the drain runner on a cadence; each invocation
must terminate when drained.

## Schedule intent

- Prefer sandbox first while credentials are new
- Live + sandbox isolation via `A_SEARCH_ENV` (same as workers/maintainer)
- Cadence: daily (clubscan `Awin-Onboarding` intent) + optional more frequent
  drain — exact rate in FR-056 / CDK

## CAST IRON

- Harvest + intake to `SimonBarnett/a-search` from the onboarding CWD
- Never commit secrets; never put tokens in signup rows or intake bodies
- Fatals → `shared/intake/reportException` (see `docs/intake-on-exception.md`)

## Out of scope (this doc FR)

- Implementing `run.js` / `drain.js` (later FR-049 slices + FR-050/051)
- Live Awin join API (FR-050)
- Daily email HTML (FR-052)
