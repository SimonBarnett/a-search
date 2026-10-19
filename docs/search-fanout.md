# Search fan-out (FR #4030)

Agents call **`POST /search`** with `hostkey`, `guid`, and `queries` / `exclude`
(same shape as `searches.json`). Auth is the agent API key
(`x-agent-api-key` or `Authorization: Bearer agent:<key>`), matching Lambda env
`A_SEARCH_AGENT_API_KEY`. FR #4311 stores that key in a generated Secrets
Manager secret (`AgentApiKeySecret`). The entry Lambda reads it with a
CloudFormation dynamic reference and `grantRead`. Stack outputs are
`SearchApiUrl` and `AgentApiKeySecretArn` only - never the key value, and
never a `-c agentApiKey` context string. This is not a public widget route; HTTP API CORS stays
on the FR-153 allowlist (never `*`).

## Fan-out

After validating that `a-clubs/{hostkey}/{guid}/` exists (404 `guid_not_found`
otherwise), entry reads `userid` from the host marker `a-clubs/{hostkey}/`
Metadata (FR #4415 / #4287). Missing userid is **400 `userid_required`** ---
never enqueue jobs that would crash workers with `TrackedUrlError`. Then entry
mints a `searchid` and enqueues:

1. one message to **each enabled live** provider queue (registry `kind:live`)
2. one message to the **SQL SQS** queue (`a-search-db-backed`, env
   `SQS_DB_BACKED_URL` / `SQS_SQL_URL`)

Response: **`202 { searchid, queued: [providers..., "sql"] }`**. Nothing is
written to MSSQL from AWS.

A second POST for the same GUID (FR #4265) reads
`a-clubs/{hostkey}/{guid}/search-fanout.json` and returns
`202 { searchid, queued, idempotent: true }` without sending again. The first
successful fan-out writes that marker. On **FIFO** provider queues,
`MessageDeduplicationId` is `{searchid}-{source}` so a lost response inside
the FIFO dedupe window also does not double-enqueue. The SQL queue is
**standard** (FR #4411): entry must **not** send `MessageGroupId` /
`MessageDeduplicationId` there (AWS `InvalidParameterValue`); SQL idempotency
is the fan-out marker only.

Each job payload includes userId / userid from the host marker so live
providers can stamp tracked outbound links (FR #4415). Payloads may carry
messageGroupId=<provider|sql> for app-level intent; entry/src/sqsSend.js
attaches SQS FIFO attrs only when QueueUrl ends in .fifo (FR #4411).

## Provider queues (FR #4039)

Each live marketplace provider queue is FIFO:

`a-search-provider-{name}-{live|sandbox}.fifo`

with sibling DLQ `a-search-provider-{name}-{live|sandbox}-dlq.fifo`. CDK sets
`fifo: true` and `contentBasedDeduplication: false`; senders set
`MessageGroupId=<provider>` and a `MessageDeduplicationId` on those FIFO
URLs only. The SQL queue (`a-search-db-backed`) stays standard --- never send
FIFO-only params to it (FR #4411). Deploy replaces existing standard
provider queue names (SQS cannot convert standard -> FIFO in place).

## One job at a time (no 429 storms)

**Choice:** provider queues are **FIFO** (FR #4039) **and** worker Lambdas keep
**`reservedConcurrentExecutions: 1`** with SQS event source **`batchSize: 1`**.
AWS ESM `maxConcurrency` cannot go below 2 (#542), so the event source does not
set it (FR #4357). FIFO + reserved concurrency together serialise work. Senders set `MessageGroupId` + `MessageDeduplicationId`.

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
`shared/search/writeInResultS3.js`. The SQL/walrus drain uses the schema now;
**provider workers wire `writeInResultToS3` in #4040**.

## SQL SQS: drained on walrus

**Walrus** drains the SQL queue (`a-search-db-backed`) as an on-box service
(webhook → SQS). It long-polls over outbound HTTPS only (no inbound ports), runs
the database search against the a-search DB on **walrus** over the LAN (**never
madeiradb** — madeiradb stays SELECT-only via `mdb.*` views), and writes
`a-clubs/{hostkey}/{guid}/IN/{searchid}-sql.json` in the common IN/ format onto
the drive mapped to the a-search S3 bucket. The message is deleted only after a
successful write.

**No AWS Lambda connects to MSSQL.** The a-search database lives on walrus and
inbound SQL ports stay closed; Lambda only enqueues. Runnable drain / sql-worker
gaps are tracked in #4447 (docs here match the design; that issue lands the
service).

**IAM:** consume on the SQL queue + Put/Get/List on `a-clubs` belongs to a
**walrus** SQL-drain principal. Stack output name is **TBD** until #4447 (today
CDK still emits `RedqueenSqlDrainUserName` / `a-search-redqueen-sql-drain` from
the #4030 transition — treat that as legacy until renamed).

## Access

| Principal | May |
|-----------|-----|
| Entry `/search` | Send to provider queues + SQL queue; Head/Get on `a-clubs` markers |
| Provider worker | Receive own queue; write `a-clubs/*/*/IN/*` |
| Walrus SQL drain | Receive/delete SQL queue; write `a-clubs` IN/ (no Lambda→MSSQL) |

No secrets (agent key, provider API keys, emails) in logs.
