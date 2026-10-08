# Feature request: Phase 2 — develop all stub providers (stay dark)

**Target repo:** `SimonBarnett/a-search` (existing; do **not** `gh repo create`)  
**Shape:** **service** (reuse LOCKED product shape)  
**Date:** 2026-10-08  
**Plan folder:** `bob/plan/work/plan-20261008-095625`

## Objective

Every registry provider that today ships only a stub `worker.js` gains a
fixture-backed real client/worker path (search or local Parts/catalogue),
selftest probe, and rateLimit metadata, while **`enabled.live` and
`enabled.sandbox` remain false** until account details exist — so fan-out
never calls unfinished networks in production.

LOCKED (Phase-2 intent)

## Success

| id | metric | target | how measured | fail-when |
|----|--------|--------|--------------|-----------|
| P2-S1 | Live stubs de-stubbed | `kelkoo`, `skimlinks`, `aliexpress`, `etsy`, `bol` each have `search.js`, `normalize.js`, non-stub `worker.js`, `selftestProbe.js`, fixtures, and unit tests | Per-id `node --test` pins + file existence checklist in `docs/phase2-providers.md` | Any of the five still returns stub “not wired yet” from `run(msg)` happy path |
| P2-S2 | Local feed stubs de-stubbed | `partnerize`, `webgains`, `tradedoubler`, `admitad`, `flexoffers`, `avantlink` each have `queryParts.js`, non-stub `worker.js`, `selftestProbe.js`, feed-parser hook + tests | Per-id pin tests | Stub worker message remains for any feed id |
| P2-S3 | Merchant store stubs de-stubbed | `shopify`, `wix`, `woocommerce` each have catalogue client + fixtures, Parts normalize/upsert contract, non-stub worker, selftestProbe + tests | Per-id pin tests | Any store id still stub-only |
| P2-S4 | Stay-dark registry | For every Phase-2 id above, `enabled.live===false` and `enabled.sandbox===false` until a later explicit enable FR | `tests/fr061-phase2-providers-docs.test.js` (or successor) reads `providers/registry.json` | Any Phase-2 id enabled true without dedicated enable FR |
| P2-S5 | Live stub onboarding books | Each of the five live stub folders has `a-search-<id>-onboarding/SKILL.md` with CAST IRON harvest + `-Repo SimonBarnett/a-search` | `tests/provider-onboarding-skills.test.js` (extended) | Missing onboarding skill for a live stub id |
| P2-S6 | No live network in unit tests | All new provider unit tests use injected fetch/SQL and recorded fixtures | CI `npm test` / `node --test` on changed suites | Unit test requires real vendor credentials or outbound vendor HTTP |

LOCKED

## Gap vs current tree (`origin/main` @ 27e17d2)

- Open issues: **0**; Success S1–S20 pin paths exist.
- Enabled live (`amazon`,`ebay`,`rakuten`,`cj`) and local (`awin`,`impact`) already have real workers.
- Fourteen providers remain stub `worker.js` (five live + six feed + three store).
- Live stubs lack `a-search-<id>-onboarding` skill folders (locals already have them from FR-060).
- CDK does not need to enable EventSources for dark providers in this phase.

## Stack / architecture

Unchanged from `docs/vision.md`: Node 20+ on AWS; entry fan-out only enqueues
`enabled[env]===true` sources; shared layer for `writeResults` / `assertEnv` /
intake / tracked links; per-folder `.env` isolation.

```
registry.enabled[env]=false  -->  entry fan-out skips id
id still ships: fixtures + search/query + worker + selftestProbe + rateLimit
later: explicit enable FR flips enabled after account details
```

## Screens

No new UI. Existing `docs/mocks/{home,empty,error}.html` remain the gateway
wireframes. Provider work is service/worker only.

## Small FR split

Anti-omnibus backlog (one Goal/Deliverables/Testable issue → one PR each):

| Range | Theme |
|-------|--------|
| FR-061 | Phase-2 docs + stay-dark pin |
| FR-062 | Live stub onboarding skillbooks |
| FR-063–082 | Live five × (search, normalize, worker, selftest+rateLimit) |
| FR-083–100 | Local feed six × (queryParts+worker, selftest+rateLimit, feed-parser) |
| FR-101–112 | Store three × (catalog, normalize/upsert, worker, selftest+rateLimit) |

Index: `FR-PHASE2-INDEX.csv`. Bodies: `docs/fr/FR-061.md` … `FR-112.md`.

## Out of scope (this FR pack)

- Setting any Phase-2 provider `enabled` true
- Amazon Creators API
- Awin onboarding live HTTP drain completion
- Inventing account IDs, secrets, or production endpoints
- Repo UAT / release stamping

## Filing rule

Drafts live in this plan folder until the operator confirms GitHub create.
When filing: create `feature-request` issues one-at-a-time or batch under
explicit “file ALL Phase-2 FRs” override; never one omnibus issue for all
providers.
