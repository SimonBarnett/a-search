# SQS pacing (prevent provider 407 / 429)

Affiliate and marketplace APIs throttle or **block** clients that fire too
many concurrent search jobs. Operators often call that **"407ing"** even when
the HTTP status is **429 Too Many Requests**, a provider-specific block page,
or another throttle code. Treat **407 and 429** (and equivalent provider
blocks) the same: the fleet was too hot for that source.

Goal: SQS consumers for each provider must run **slow enough** that live
provider APIs do not rate-block the account.

## Rules (CAST IRON)

| Rule | Detail |
|------|--------|
| One message at a time (default) | Worker SQS event sources use `batchSize: 1` in CDK (`cdk/lib/a-search-stack.js`). Do not raise batch size without a source-specific rate plan. |
| Cap concurrency | For **amazon**, **ebay**, and **cj**, CDK sets SQS event-source `maxConcurrency` from `registry.rateLimit.maxConcurrency` via `sqsMaxConcurrencyForSource` (AWS ESM floor 2–1000; registry `1` clamps to `2`). Other providers still prefer `reservedConcurrentExecutions` until a later FR-058 slice. |
| Per source / per env | Live and sandbox queues stay separate (`docs/environments.md`). Pacing is **per queue** — sandbox must not share live concurrency budget. |
| Back off on throttle | On 407 / 429 / provider "blocked" responses: use `shared/pacing/throttleBackoff.js` (`backoffOnHttpThrottle`) — sleep `Retry-After` (or default), then throw `ProviderThrottleError` so SQS can retry. Do **not** tight-loop HTTP in-process. |
| Fail-when | Sustained 407/429 from a provider after deploy, or workers configured with high `batchSize` / unbounded concurrency against a rate-limited API. |

## Operator knobs

| Knob | Where | Notes |
|------|-------|--------|
| `batchSize` | CDK `SqsEventSource` | Default `1`. Raising it multiplies in-flight vendor calls per invoke. |
| `maxConcurrency` | CDK `SqsEventSource` + `providers/registry.json` `rateLimit` | Wired for **amazon** (FR-058e), **ebay** (FR-058f), and **cj** (FR-058h) via `sqsMaxConcurrencyForSource` in `cdk/lib/a-search-stack.js`. AWS ESM range 2–1000. |
| `reservedConcurrentExecutions` | Worker Lambda (CDK / console) | Hard cap on parallel invokes for that function (still useful for sources without ESM maxConcurrency yet). |
| Queue depth | CloudWatch / ops | Growing backlog with low concurrency is healthier than zero backlog + 429 storms. |
| Source skill | `providers/*/…/SKILL.md` | Record vendor rate limits and any extra sleep/backoff for that API. |
| `createMinIntervalPacer` | `shared/pacing/minInterval.js` (FR-058c) | Space provider HTTP calls by `minIntervalMs` (wire in workers later). |

## Related

- `docs/environments.md` — live/sandbox queue isolation
- `docs/add-source.md` — new sources must wire queues without breaking pacing
- CDK worker wiring: `cdk/lib/a-search-stack.js` (`batchSize: 1`; amazon/ebay/cj `maxConcurrency` from registry)

## Out of scope here

- CDK `maxConcurrency` for providers other than amazon/ebay/cj (later FR-058 slices)
- Provider-specific HTTP client retry libraries
