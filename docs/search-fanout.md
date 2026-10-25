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

An affiliate is a source we download parts from and are paid in commission. A
merchant is a source we download parts from and charge a monthly fee. A search
provider returns search results from a live API at search time. **Only search
providers run on AWS.** Those are **Amazon, eBay, Rakuten, CJ, Kelkoo and
Etsy**. AliExpress and Bol are search providers too, and stay registry-disabled
until an enable FR. **Skimlinks** has no documented keyword-search API, so it
is an affiliate catalogue downloaded into SQL, not an AWS worker. Other
affiliates and merchants are downloaded into SQL and searched with full-text
search. `/search` enqueues only to the enabled search-provider queues plus the
SQL queue.

After validating that `a-clubs/{hostkey}/{guid}/` exists (404 `guid_not_found`
otherwise), entry reads `userid` from the host marker `a-clubs/{hostkey}/`
Metadata (FR #4415 / #4287). Missing userid is **400 `userid_required`** ---
never enqueue jobs that would crash workers with `TrackedUrlError`. Then entry
mints a `searchid` and enqueues:

1. one message to **each enabled AWS search provider** queue (registry
   `awsSearch: true`: amazon, ebay, rakuten, cj, kelkoo, etsy; aliexpress and bol
   when enabled)
2. one message to the **SQL SQS** queue (`a-search-db-backed`, env
   `SQS_DB_BACKED_URL` / `SQS_SQL_URL`)

Response: **`202 { searchid, queued: [providers..., "sql"] }`**. Nothing is
written to MSSQL from AWS. Job payloads carry normalized `market` /
`currency` (for example `GB` / `GBP`); providers must not rely on those
strings living inside `q` (FR #4318 / #4563). eBay maps `market` to Browse
`marketplace_id` (for example `EBAY_GB`).

A second POST for the same GUID (FR #4265) reads
`a-clubs/{hostkey}/{guid}/search-fanout.json` and returns
`202 { searchid, queued, idempotent: true }` without sending again. The first
successful fan-out writes that marker and updates
`searches.json` `searchid` to match (FR #4563). On **FIFO** provider queues,
`MessageDeduplicationId` is `{searchid}-{source}` so a lost response inside
the FIFO dedupe window also does not double-enqueue. The SQL queue is
**standard** (FR #4411): entry must **not** send `MessageGroupId` /
`MessageDeduplicationId` there (AWS `InvalidParameterValue`); SQL idempotency
is the fan-out marker only.

## Completion tracking (FR #4917)

Each worker writes a terminal record at
`a-clubs/{hostkey}/{guid}/DONE/{searchid}-{source}.json` with
`status: serviced|dlq` (including zero-product finishes --- still no `IN/`
file, FR #4823). Immediate DLQ and the final receive before SQS redrive
(`ApproximateReceiveCount >= maxReceiveCount`, including transient
429/502-504) both write `status: dlq`. When every source in
`search-fanout.json.queued` has a DONE record for the current `searchid`,
the GUID marker flips `hasresults=1` (starts at `0` with `enabled=0`).

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
URLs only. `entry/src/sqsSend.js` defaults `MessageGroupId` to the payload
`source` when the fan-out body omitted it (FR #4847). The SQL queue
(`a-search-db-backed`) stays standard --- never send FIFO-only params to it
(FR #4411). Deploy replaces existing standard
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
inbound SQL ports stay closed; Lambda only enqueues. Install the on-box service
with `walrus/install/Register-WalrusSqlDrainService.ps1` (full env: queue URL,
region, MSSQL server/auth, a-clubs root — see [walrus-sql-drain.md](./walrus-sql-drain.md)).

Affiliate and merchant catalogues, including Skimlinks, are downloaded into that
database and searched by this drain, not by an AWS provider Lambda.

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
