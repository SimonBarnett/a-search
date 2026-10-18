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

Payloads carry `messageGroupId=<provider|sql>` so FIFO queues serialise per
provider. SQL messages use group `sql`.

## One job at a time (no 429 storms)

**Choice (PR):** provider worker Lambdas use **`reservedConcurrentExecutions: 1`**
and SQS event source **`batchSize: 1`**. AWS ESM `maxConcurrency` cannot go
below 2 (#542), so reserved concurrency enforces serial execution. Senders also
set `MessageGroupId` for FIFO-ready queues.

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
