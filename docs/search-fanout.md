# Search fan-out (FR #4030)

Agents call **`POST /search`** with `hostkey`, `guid`, and `queries` / `exclude`
(same shape as `searches.json`). Auth is the agent API key
(`x-agent-api-key` or `Authorization: Bearer agent:<key>`), matching Lambda env
`A_SEARCH_AGENT_API_KEY`. This is not a public widget route; HTTP API CORS stays
on the FR-153 allowlist (never `*`).

## Fan-out

After validating that `a-clubs/{hostkey}/{guid}/` exists (404 `guid_not_found`
otherwise), entry mints a `searchid` and enqueues:

1. one message to **each enabled live** provider queue (registry `kind:live`)
2. one message to the **SQL SQS** queue (`a-search-db-backed`, env
   `SQS_DB_BACKED_URL` / `SQS_SQL_URL`)

Response: **`202 { searchid, queued: [providers..., "sql"] }`**. Nothing is
written to MSSQL from AWS.

A second POST for the same GUID (FR #4265) reads
`a-clubs/{hostkey}/{guid}/search-fanout.json` and returns
`202 { searchid, queued, idempotent: true }` without sending again. The first
successful fan-out writes that marker. `MessageDeduplicationId` is
`{searchid}-{source}` so a lost response inside the FIFO dedupe window also
does not double-enqueue.

Payloads carry `messageGroupId=<provider|sql>` so FIFO queues serialise per
provider. SQL messages use group `sql`.

## Provider queues (FR #4039)

Each live marketplace provider queue is FIFO:

`a-search-provider-{name}-{live|sandbox}.fifo`

with sibling DLQ `a-search-provider-{name}-{live|sandbox}-dlq.fifo`. CDK sets
`fifo: true` and `contentBasedDeduplication: false`; senders set
`MessageGroupId=<provider>` and a `MessageDeduplicationId`. The SQL queue
(`a-search-db-backed`) stays standard. Deploy replaces existing standard
provider queue names (SQS cannot convert standard → FIFO in place).

## One job at a time (no 429 storms)

**Choice:** provider queues are **FIFO** (FR #4039) **and** worker Lambdas keep
**`reservedConcurrentExecutions: 1`** with SQS event source **`batchSize: 1`**.
AWS ESM `maxConcurrency` cannot go below 2 (#542); FIFO + reserved concurrency
together serialise work. Senders set `MessageGroupId` + `MessageDeduplicationId`.

On HTTP **429**, workers **must** use `shared/search/backoff429.js`: respect
`Retry-After`, `ChangeMessageVisibility`, and let SQS retry. A 429 must **not**
fail straight to the DLQ. Visibility timeout remains longer than the Lambda
timeout (#1007); queues use SQS-managed encryption (#1005). Helper modules land
in this FR; **live provider call-site wire-up is #4040**.

## Results: shared IN/ schema

Providers and the SQL drain write:

`a-clubs/{hostkey}/{guid}/IN/{searchid}-{source}.json`

Schema: `shared/search/inResultSchema.js` (`searchid`, `source`, `hostkey`,
`guid`, `products[]`). Affiliate links keep the existing tenant + affiliate id
rules. Writers bump GUID and host `lastmod` (#3968) via
`shared/search/writeInResultS3.js`. SQL/redqueen path uses the schema now;
**provider workers wire `writeInResultToS3` in #4040**.

## SQL SQS: drained on redqueen

`redqueen/sql-search-drain` long-polls the SQL queue over outbound HTTPS (no
inbound ports), runs the database search against the a-search DB on **walrus**
over the LAN (**never madeiradb**), writes the same IN/ format, and deletes the
message only after a successful write.

**Reuse:** the drain loop / SQS poll helpers live in `walrus/src/*` and are
required from redqueen (ownership moves to redqueen; walrus code is the shared
library during transition). IAM user `a-search-redqueen-sql-drain` has consume on
the SQL queue + Put/Get/List on `a-clubs`.

## Access

| Principal | May |
|-----------|-----|
| Entry `/search` | Send to provider queues + SQL queue; Head/Get on `a-clubs` markers |
| Provider worker | Receive own queue; write `a-clubs/*/*/IN/*` |
| Redqueen SQL drain | Receive/delete SQL queue; write `a-clubs` IN/ |

No secrets (agent key, provider API keys, emails) in logs.
