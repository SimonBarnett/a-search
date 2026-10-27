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
| Cap concurrency | Provider workers use `reservedConcurrentExecutions: 1` (one job at a time). SQS event-source `MaximumConcurrency` is omitted: the AWS floor is 2, which Lambda rejects when reserved concurrency is 1 (FR #4357). `sqsMaxConcurrencyForSource` remains for amazon, ebay, rakuten, cj, awin, and impact and is applied only when it does not exceed that reserved concurrency. |
| Per source / per env | Live and sandbox queues stay separate (`docs/environments.md`). Pacing is **per queue** — sandbox must not share live concurrency budget. |
| Back off on throttle | On 407 / 429 / provider "blocked" responses: use `shared/pacing/throttleBackoff.js` (`backoffOnHttpThrottle`) — sleep `Retry-After` (or default), then throw `ProviderThrottleError` so SQS can retry. Do **not** tight-loop HTTP in-process. |
| Transient vendor HTTP (FR #4427) | Amazon PA-API / Creators HTML gateway **502/503/504** use `shared/search/backoff429.isTransientVendorHttp` + `handleSqsWith429` visibility backoff and skip intake spam on those SQS retries. Hard **500** responses still call intake. |
<<<<<<< HEAD
| Provider API failures (FR #4769) | Non-success API responses (incl. Amazon `paapi_non_json`, CJ `cj_not_authorised`, Rakuten `INVALID_CONTEXT_VALUE`, other 4xx/5xx) write **no** IN file; the Lambda fails so SQS retries into the provider DLQ. Real **429** still backs off. Success with 0 matches writes **no** IN (FR #4823: INFO `provider_done ... products=0`, message acked). |
| Amazon Creators AssociateNotEligible (FR #5220) | HTTP 403 `reason=AssociateNotEligible` (`creators_not_eligible`) is an eligibility gate: **ack** as `provider_unavailable` (WARN log), write `_search-done/{searchid}/amazon.json` `status=serviced` products=0, **no** IN and **no** amazon-live DLQ. Other Amazon 403s keep the DLQ path. |
=======
| Provider API failures (FR #4769) | Non-success API responses (incl. Amazon `paapi_non_json` / `creators_not_eligible`, CJ `cj_not_authorised`, Rakuten `INVALID_CONTEXT_VALUE`, other 4xx/5xx) write **no** IN file; the Lambda fails so SQS retries into the provider DLQ. Real **429** still backs off. Success with 0 matches writes **no** IN (FR #4823: INFO `provider_done ... products=0`, message acked). |
| DLQ review issues (FR #5222) | At the point a worker **sends** to a provider/SQL DLQ (immediate nonRetryable) or hits final `maxReceiveCount`, `shared/intake/reportDlqFailure.js` auto-files one a-search GitHub issue (deduped by searchid+provider; known gates like `creators_not_eligible` group). Fail-soft via intake. Never redrive, PurgeQueue, or ReceiveMessage on the DLQ from this path. See `docs/search-fanout.md`. |
>>>>>>> origin/main
| Fail-when | Sustained 407/429 from a provider after deploy, or workers configured with high `batchSize` / unbounded concurrency against a rate-limited API. |

## Operator knobs

| Knob | Where | Notes |
|------|-------|--------|
| `batchSize` | CDK `SqsEventSource` | Default `1`. Raising it multiplies in-flight vendor calls per invoke. |
| `maxConcurrency` | CDK `SqsEventSource` + `providers/registry.json` `rateLimit` | Helper `sqsMaxConcurrencyForSource` still covers **amazon** (FR-058e), **ebay** (FR-058f), **rakuten** (FR-058g), **cj** (FR-058h), **awin** (FR-058i), and **impact** (FR-058j). It is not written onto the event source while reserved concurrency is 1 (FR #4357). |
| `reservedConcurrentExecutions` | Worker Lambda (CDK / console) | Hard cap of 1 on provider workers. This is what serialises invokes. |
| Queue depth | CloudWatch / ops | Growing backlog with low concurrency is healthier than zero backlog + 429 storms. |
| Source skill | `providers/*/…/SKILL.md` | Record vendor rate limits and any extra sleep/backoff for that API. |
| `createMinIntervalPacer` | `shared/pacing/minInterval.js` (FR-058c) | Space provider HTTP calls by `minIntervalMs` (wire in workers later). |

## Related

- `docs/environments.md` — live/sandbox queue isolation
- `docs/add-source.md` — new sources must wire queues without breaking pacing
- CDK worker wiring: `cdk/lib/a-search-stack.js` (`batchSize: 1`; provider workers `reservedConcurrentExecutions: 1`; SQS `MaximumConcurrency` omitted, FR #4357)

## Out of scope here

- CDK `maxConcurrency` for providers other than amazon/ebay/rakuten/cj/awin/impact (later FR-058 slices)
- Provider-specific HTTP client retry libraries
