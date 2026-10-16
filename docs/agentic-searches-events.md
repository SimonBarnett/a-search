# Agentic Searches -- S3 event -> agent queue (FR-233 / #1343 / FR-3355)

Authoritative event suffixes for ComponentsPiece widget-tree ObjectCreated notifications.
Physical prefix: `{env}/x/` in `S3_RESULTS_BUCKET` (`env` = `live`|`sandbox`).

## Event table (LOCKED)

| eventType | S3 key suffix (ObjectCreated) | Written by | Pass |
|---|---|---|---|
| `host_created` | `{customerNumber}/_host.json` | first-sight bootstrap (FR-197) | host |
| `widget_created` | `{customerNumber}/{widgetGuid}/widget.json` | bind / mint (FR-232) | widget (host first if site.md missing) |
| `widget_feedback` | `{customerNumber}/{widgetGuid}/feedback.json` | extension Edit API (#1344) | widget |
| `in_ready` | `{customerNumber}/{widgetGuid}/IN/{searchId}.json` | search normaliser (FR-206 / FR-3344) | widget |
| `tier_changed` | (not S3) Stripe webhook -> queue per active widget | upgrade/downgrade (#1345) | widget |
| `sweep` | (not S3) EventBridge Scheduler daily per active widget | scheduler | widget prune/expiry |

## in_ready rules (FR-3355)

- Ready files only: `IN/{searchId}.json` (one file per search).
- Do **not** fire on:
  - retired single-file inbound at the widgetGuid folder root
  - `IN/.processing/**` (agent claim/rename path)
  - agent outputs: `live.json`, `context.md`, `searches.json`, `site.md`, `top10.json`, `_agent/last-run.json`
  - `stats.json` (FR-234; not a trigger)
- Classify in code: `shared/widgets/agentEventClassify.js` (`isInReadyKey`, `classifyWidgetS3Key`).

## Queue

- SQS FIFO `a-search-widget-agent.fifo` + DLQ (see #1343).
- `MessageGroupId` = `{env}/{customerNumber}/{widgetGuid}` (host pass uses `{env}/{customerNumber}/_host`).
- EventBridge cannot set dynamic FIFO MessageGroupId from the S3 key alone: enqueue Lambda runs classify / fifoSendParams first.

## Related

- FR-3344 (#3344) IN/ folder layout
- FR-3355 (#3355) this suffix lock
- FR-206 ingest, FR-232 widgetGuid paths, FR-233 docs lock (#1347), living FR #1343
