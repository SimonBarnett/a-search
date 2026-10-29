# Search fan-out (FR #4030)

Agents call **`POST /search`** with `hostkey`, `guid`, and `queries` / `exclude`
(same shape as `searches.json`). **FR #5281:** each `queries[]` row may also carry
`brand`, `model`, `sku` (and optional `brands` / `models`) from the page annotation
selection so SQL can use exact CONTAINS gates; live providers keep using `q` and
ignore the structured fields safely. `searches.json` may also list top-level
`brands` / `models` from selection. Auth is **API Gateway IAM** (`HttpIamAuthorizer`,
FR #4888 / #5086): callers sign with SigV4 (`a-search-redqueen-annotator` or
equivalent). The entry Lambda does **not** require `x-agent-api-key`. When the
event carries `requestContext.authorizer.iam`, entry logs the caller ARN (never
secrets). Stack outputs are `SearchApiUrl` and `AgentApiKeySecretArn` (FR #4311
secret still generated with a CloudFormation dynamic reference into entry env for
compatibility, but unused by `/search` after FR #5086) --- never the key value,
and never a `-c agentApiKey` context string. This is not a public widget route;
HTTP API CORS stays on the FR-153 allowlist (never `*`).

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
otherwise; opaque S3 `Unknown`/`UnknownError` is **503 `s3_head_failed`**,
FR #5090, not a 500 intake `Unknown`), entry reads `userid` from the host marker `a-clubs/{hostkey}/`
Metadata (FR #4415 / #4287). Missing userid is **400 `userid_required`** ---
never enqueue jobs that would crash workers with `TrackedUrlError`. Then entry
mints a `searchid` and enqueues:

1. one message to **each AWS search provider** that passes all three gates
   (FR #5079):
   - `providers/registry.json` live/sandbox enabled + `awsSearch: true`
   - deploy queue URL present (`SQS_<X>_LIVE_URL` / soft-env FR #4650)
   - `s3://a-affiliates/<provider>/` folder metadata `enabled=1` (shared
     `parseEnabledFlag` / `isEnabledOne`; missing folder, `enabled=0`, or
     HeadObject 403/Unknown/AccessDenied (FR #5095 / #5090) is skipped and
     logged --- never 500 the POST. Entry IAM includes s3:ListBucket on
     a-affiliates so a missing key is 404). Candidate ids include amazon, ebay, rakuten, cj,
     kelkoo, etsy; aliexpress and bol when registry-enabled. Creating amazon /
     ebay folders needs Simon's go before deploy, or they stop being searched.
2. one message to the **SQL SQS** queue (`a-search-db-backed`, env
   `SQS_DB_BACKED_URL` / `SQS_SQL_URL`) --- always; SQL covers local/db-backed
   sources such as awin (their a-affiliates folders do not gate the sql target)

Response: **`202 { searchid, queued: [providers..., "sql"] }`**. Nothing is
written to MSSQL from AWS. Job payloads carry normalized `market` /
`currency` (for example `GB` / `GBP`); providers must not rely on those
strings living inside `q` (FR #4318 / #4563). eBay maps `market` to Browse
`marketplace_id` (for example `EBAY_GB`).

Every POST `/search` for a GUID fans out again and rewrites
`a-clubs/{hostkey}/{guid}/search-fanout.json` (FR #4916; Simon 2026-10-25
removed the FR #4265 per-GUID short-circuit). The fan-out write also updates
`searches.json` `searchid` to match (FR #4563). On **FIFO** provider queues,
`MessageDeduplicationId` is `{searchid}-{source}` so a lost response inside
the FIFO dedupe window also does not double-enqueue. The SQL queue is
**standard** (FR #4411): entry must **not** send `MessageGroupId` /
`MessageDeduplicationId` there (AWS `InvalidParameterValue`). Hourly
re-search age is owned by `a-searches` (`defaultage` / `lastsearch` or fan-out
`at`), not by an idempotent `/search` guard.

## Completion tracking (FR #4917 / FR #5142 / FR #5198)

Each worker writes a terminal record at
`a-clubs/_search-done/{searchid}/{source}.json` with
`status: serviced|dlq` (including zero-product finishes --- still no `IN/`
file, FR #4823). **FR #5198:** do not create files under
`a-clubs/{hostkey}/{guid}/DONE/` (Simon: no empty/zero DONE folder in the
club GUID tree). The `_search-done/` prefix is bucket-root ops state outside
the GUID folder; bodies still carry `hostkey`/`guid` for debugging.
Immediate DLQ and the final receive before SQS redrive
(`ApproximateReceiveCount >= maxReceiveCount`, including transient
429/502-504) both write `status: dlq`. When every source in
`search-fanout.json.queued` has a terminal record for the current `searchid`,
the GUID marker flips `hasresults=1` on **S3 object metadata** (starts at
`0` with `enabled=0`). FR #5270: that flip does **not** write `live.json` or
set `enabled=1`. Search workers and drains only write `IN/`, `_search-done/`,
and `hasresults`. The redqueen hasresults monitor / agent SELECTS the best
parts from `IN/` into `live.json` and sets `enabled=1` (Simon #5256).

### DLQ review issues (FR #5222)

When a provider Lambda or the walrus SQL drain **sends** a message to a DLQ
(immediate nonRetryable path) or hits the **final receive** at
`maxReceiveCount`, `shared/intake/reportDlqFailure.js` files one GitHub issue
in SimonBarnett/a-search via bobiverse intake (same fail-soft path as
`reportException`). Coverage: every
`a-search-provider-*-{live|sandbox}-dlq.fifo` plus `a-search-db-backed-dlq`.

Issue body includes provider/source, main+DLQ queue URLs, host/GUID,
searchid, queries (redacted), failure code, last error (redacted),
`ApproximateReceiveCount`, path (`immediate` | `maxReceiveCount`), GMT
timestamp, and a CloudWatch Logs Insights hint. Dedupe key is normally
`(searchid, provider)`; known gates such as `creators_not_eligible` group by
`provider|code` so one open issue can take counter comments. Filing must not
`ReceiveMessage` / `PurgeQueue` / `StartMessageMoveTask` on a DLQ --- redrive
stays Simon-only. Intake failure logs `dlq_issue_report_failed` and does not
change SQS/DLQ behaviour.

FR #5142: the last writer must win even when SQL terminals land via walrus
mapped-drive/rclone after live providers. Walrus writes `_search-done/` on
the mapped drive **and** calls S3 `recordSearchTerminal` when AWS deps are
present. `recordSearchTerminal` re-checks once if a sibling terminal was
briefly missing. Legacy `{host}/{guid}/DONE/` keys are still **read** during
transition so in-flight searches can flip. `a-searches` hourly and the
redqueen `a-hasresults-monitor` also run `recheckIncompleteHasResults` to
flip any GUID whose terminal set is complete but `hasresults` is still
unset. Flip failures log `hasresults_flip_failed` at **ERROR** (still
fail-soft so a search is not DLQ'd for a marker rewrite miss). Seeding
missing `hasresults`/`enabled` on old markers:
`node tools/seed-guid-marker-hasresults.js` (dry-run) / `--simon-go` only with
Simon's approval. Deleting existing GUID `DONE/` folders also needs Simon's
yes (FR #5198).

FR #5265: after the monitor promotes and clears `hasresults=0`, recheck must
**not** re-flip the same fan-out every pass. `maybeSetHasResults` stamps
marker metadata `promotedsearchid=<searchid>`; recheck skips when that stamp
matches the current `search-fanout.json` searchid (already promoted). Legacy
markers without the stamp skip when `enabled=1` and marker `lastmod` is at
least as new as the newest DONE `at`. A **new** fan-out searchid (newer DONE)
is promoted again exactly once. Do not hand-set `hasresults` to test this.

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

FR #5122 / FR #5131: `a-search-redqueen-annotator` and `a-search-redqueen-agents`
get read-only `sqs:GetQueueAttributes` on `arn:aws:sqs:<region>:<account>:a-search-*`
(provider queues+DLQs and the SQL db-backed pair share that name prefix) and
`sqs:ListQueues` so overnight verification can report depths. The resource is a
single wildcard because IAM **user** inline policies are capped at **2048**
bytes --- enumerating every queue ARN blew the limit and rolled back deploy
(#5131). Do not redrive or purge from that identity. Rakuten (and other live
workers) still write `DONE` via `writeLiveProviderInResult` on 0 products.

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
madeiradb** - madeiradb stays SELECT-only via `mdb.*` views), and writes
`a-clubs/{hostkey}/{guid}/IN/sql.json` in the common IN/ format onto
the drive mapped to the a-search S3 bucket. The message is deleted only after a
successful write. FR #5135: a 0-product SQL search **deletes** `IN/sql.json`
instead of leaving an older search's rows; `promoteInToLive` also ignores
`IN/sql.json` whose `searchid` is not the current `search-fanout.json` search.
Per-searchid live files (`IN/{searchid}-{source}.json`) are unchanged.

**No AWS Lambda connects to MSSQL.** The a-search database lives on walrus and
inbound SQL ports stay closed; Lambda only enqueues. Install the on-box service
with `walrus/install/Register-WalrusSqlDrainService.ps1` (full env: queue URL,
region, MSSQL server/auth, a-clubs root - see [walrus-sql-drain.md](./walrus-sql-drain.md)).

Affiliate and merchant catalogues, including Skimlinks, are downloaded into that
database and searched by this drain, not by an AWS provider Lambda.

**IAM:** consume on the SQL queue + Put/Get/List on `a-clubs` belongs to a
**walrus** SQL-drain principal. Stack output name is **TBD** until #4447 (today
CDK still emits `RedqueenSqlDrainUserName` / `a-search-redqueen-sql-drain` from
the #4030 transition - treat that as legacy until renamed).

## Access

| Principal | May |
|-----------|-----|
| Entry `/search` | Send to provider queues + SQL queue; Head/Get on `a-clubs` markers |
| Provider worker | Receive own queue; write `a-clubs/*/*/IN/*` |
| Walrus SQL drain | Receive/delete SQL queue; write `a-clubs` IN/ (no Lambda→MSSQL) |

No secrets (agent key, provider API keys, emails) in logs.
