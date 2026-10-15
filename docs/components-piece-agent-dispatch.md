# ComponentsPiece agent dispatch (#1343)

**Repo:** SimonBarnett/a-search
**Status:** LOCKED contract (issue #1343)

Reactive agent runs when the customer widget tree changes under `{env}/x/`.
Agents live on the rclone SQL host (see [rclone-results.md](rclone-results.md));
they must **not** use LLM tokens while idle.

## Event flow

```
S3 ObjectCreated ({env}/x/...)
  -> EventBridge (bucket eventBridgeEnabled)
  -> enqueue Lambda (classify + SendMessage)
  -> SQS FIFO a-search-widget-agent.fifo
  -> components-piece/dispatcher (long-poll)
  -> idle agent worker (host or widget pass)
  -> writes live.json / context.md / site.md / top10.json / _agent/last-run.json
```

`tier_changed` and daily `sweep` are non-S3 producers that also SendMessage to the same FIFO.

## Trigger suffixes (only these)

| eventType | S3 key suffix | Pass |
|-----------|---------------|------|
| host_created | `{customerNumber}/_host.json` | host |
| widget_created | `{customerNumber}/{widgetGuid}/widget.json` | widget (+ host if site.md missing) |
| widget_feedback | `.../feedback.json` | widget |
| in_ready | `.../in.json` | widget (ingest) |

Agent outputs (`live.json`, `context.md`, `searches.json`, `site.md`, `top10.json`,
`stats.json`, `last-run.json`, `in.processing.json`) **must not** enqueue. There is
no `stats_changed` event (FR-234); stats are read on existing passes.

## Queue

- Name: `a-search-widget-agent.fifo` (+ DLQ, `maxReceiveCount` 5)
- Encryption: SQS-managed SSE (same family as FR-162)
- `MessageGroupId` = `{env}/{customerNumber}/{widgetGuid}` or `{env}/{customerNumber}/_host`
- `MessageDeduplicationId` = `{eventType}:{s3Key}:{sequencer}` (S3) or day-keyed for sweep/tier
- Visibility timeout > `AGENT_JOB_TIMEOUT_S` (default 900)
- Body: `{ eventType, env, customerNumber, widgetGuid, host, s3Key, at }` --- no secrets

Why an enqueue Lambda: EventBridge cannot set a **dynamic** FIFO `MessageGroupId`
from the S3 key alone; the Lambda runs `shared/widgets/agentQueue.js` classify helpers.

## Dispatcher wrapper

Path: `components-piece/dispatcher/`. Deterministic Node service on the rclone host.

- Long-poll SQS (`WaitTimeSeconds=20`) --- no LLM tokens
- Pool size `AGENT_POOL_SIZE` (default 2)
- Takes a message only when a worker is idle
- Deletes the message only after the agent reports `ok`
- Failures leave the message for retry; DLQ after 5 receives
- Resolves tier before dispatch (agent never calls Stripe)
- Writes `{customerNumber}/{widgetGuid}/_agent/last-run.json` (or host `_agent/`)

## Idle = zero tokens (LOCKED)

An idle worker blocks on the local job channel. No LLM calls, no timers polling
S3/mount, no token use until `job start` ... `job done`.

## rclone expectations

`A_SEARCH_RCLONE_ROOT` includes the bucket folder (FR-124). Agent CWD:

- Host pass: `{root}/{env}/x/{customerNumber}/`
- Widget pass: `{root}/{env}/x/{customerNumber}/{widgetGuid}/`

Build keys only via `shared/widgets/widgetPath.js`.

## Related

FR-232 (#1346), FR-233 (#1347), FR-204..207, FR-210, FR-234 (#1348), FR-251 (#1365), #1345