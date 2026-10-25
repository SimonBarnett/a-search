# APartsGateway (FR #3968)

Standalone CDK app for the **parts widget** `GET /parts` route. Deploys on its
own --- it does **not** touch `ASearchStack`, RDS/MSSQL, VPC, or `madeira-*`
Lambdas.

## What it creates

| Resource | Notes |
|----------|--------|
| HTTP API | `GET /parts` + CORS `allowOrigins: ['*']` (GET+OPTIONS; credentials false; `allowHeaders`: `content-type`, `x-parent-origin` FR #4177) |
| Node 20 Lambda | `parts-gateway/src/handler.handler` |
| IAM | `s3:GetObject` / `PutObject` / `ListBucket` / tagging on `arn:aws:s3:::a-clubs` and `a-clubs/*` only |
| SQS FIFO `a-clubs-new-folders.fifo` | SSE-SQS; visibility 90s; `MessageGroupId=hostkey` |
| SQS FIFO DLQ `a-clubs-new-folders-dlq.fifo` | maxReceiveCount 5 |
| IAM user `a-search-redqueen-annotator` | consume queue + S3 Get/Put/List on `a-clubs` |
| EventBridge on imported `a-clubs` (FR #4890) | `fromBucketName` + `enableEventBridgeNotification()`; unmanaged merge keeps existing Topic/Queue/Lambda configs; no hand-run enable script |

This stack hardcodes CORS `allowOrigins: ['*']`. It does **not** call
`resolveCorsOrigins` (that helper rejects `*` for `ASearchStack` FR-153).
Preflight `allowHeaders` includes `content-type` and `x-parent-origin` so
embedded widgets (FR #4107) that send `X-Parent-Origin` are not blocked by
browsers (FR #4177).

The Lambda expects the **existing** bucket `a-clubs` in the deploy account. Deploying this stack enables EventBridge notifications on that imported bucket via CDK (`enableEventBridgeNotification`, Managed=false merge). Do not run a hand put of `EventBridgeConfiguration`. It
auto-creates `a-clubs/{hostkey}/` (Madeira checksum userid metadata;
`customerNumber` === `userid`, plus `lastmod`, empty `email` / `passwordhash` /
`stripeaccountid` / `stripecustomerid`) and `a-clubs/{hostkey}/{guid}/` seeded
files on first request.

**Host** comes from the `Origin` header only (`?host=` is ignored). Missing or
unparseable Origin returns `400` `origin_required`.

**FR #4107 — club domain, not embed frame:** when `Origin` is a known embed
iframe host (today: `*.filesusr.com` Wix HTML components), the gateway resolves
the **club's own domain** before creating any `a-clubs/{hostkey}/` folder or
queue message. Wix encoding (vendor docs + live sample
`www-mymodelflyingclub-co-uk.filesusr.com` ↔ `www.mymodelflyingclub.co.uk`)
replaces every `.` in the club hostname with `-`. Literal hyphens in a club
domain are lossy under that encoding: the widget may send `X-Parent-Origin`
(from `location.ancestorOrigins` / `document.referrer`); it is accepted **only**
when it re-encodes to the same filesusr label, and it is never a free-form
`?host=` override. If the club domain cannot be determined unambiguously,
returns `400` `club_domain_unresolved` and creates **nothing**. Embed-pattern
hosts are never stored as hostkeys (gateway resolve + `ensureAclubsHost` guard).

**GUID folder marker** (zero-byte `a-clubs/{hostkey}/{guid}/`): `uri`, `seen=0`,
`clicks=0`, `since`, `lastmod`, `annotated=0`, `enabled=0` (FR #4891; replaces
former `init`), `hasresults=0` (FR #4917). New markers do **not** carry an `init`
key. `hasresults` flips to `1` when every source in the current
`search-fanout.json` has a terminal `DONE/{searchid}-{source}.json`
(`status` `serviced` or `dlq`); that flip also runs `promoteInToLive` (IN/ →
`live.json`, then `enabled=1`, including empty IN → empty live → `no_parts`).
`widget.json` is a plain seed file (no GUID folder metadata). `uri` prefers the
`Referer` path; else `pageUri` / `uri` query. Documented choice: Referer first.

Host claim helpers (shared `hostFolderMeta.js`): `setHostCredentials` (scrypt
hash format `scrypt$N$r$p$saltHex$hashHex`; Madeira auth not vendored here) and
`setHostStripe({accountId, customerId})`. `GET /parts` never returns email,
passwordhash, or Stripe ids.

**Canonical `/parts`:** this stack only (`PartsGatewayApiUrl`). `ASearchStack`
no longer hosts `GET /parts` (FR #4891). Embed `data-api-base` must be
`PartsGatewayApiUrl`.

`GET /parts` reads `enabled` on the GUID marker (does **not** promote IN/):
- `enabled != 1` → HTTP **202** + `Retry-After: 5`, body
  `{status:'searching', parts:[], nextOffset:null, retryAfterMs:5000, init:0, enabled:0, …}`
  (widget shows "Searching for parts..." and polls).
- `enabled=1` with live parts → HTTP 200 `{status:'ok', parts, nextOffset, init:1, enabled:1, …}`.
- `enabled=1` empty live → HTTP 200 `{status:'no_parts', parts:[], init:1, enabled:1, …}`
  (widget shows "No parts found").

Folder events: on **new host** and **new GUID**, the gateway sends
`{hostkey, host, createdAt}` to `a-clubs-new-folders.fifo`
(`MessageGroupId=hostkey`). Env `A_CLUBS_FOLDER_EVENTS_QUEUE_URL`. Gateway
Lambda has `grantSendMessages` only.

## Synth / deploy

Target: account `620257466932`, region `eu-west-2`.

```bash
npm ci
npm run stage-parts-gateway
npx cdk synth --app "node cdk/bin/parts-gateway.js" APartsGateway \
  -c account=620257466932 -c region=eu-west-2

npx cdk deploy --app "node cdk/bin/parts-gateway.js" APartsGateway \
  -c requireDeployEnv=true \
  -c account=620257466932 -c region=eu-west-2
```

**Staging (FR #4078):** `stage-parts-gateway` copies `parts-gateway/src` + the
shared helpers, then `npm install --omit=dev` of `@aws-sdk/client-s3` and
`@aws-sdk/client-sqs` **inside** the asset directory so transitive packages
(`@aws-sdk/checksums`, `@smithy/*`, …) ship with the Lambda. Do not restore the
old cherry-pick copy from the repo-root `node_modules`. Staging needs network.

`cdk diff` for this app should show **only** new APartsGateway resources.
No `-c corsOrigins=` is required (CORS is hardcoded `*`).

## Smoke

```bash
curl -sS -H "Origin: https://example.com" \
  "$PartsGatewayApiUrl/parts?widgetGuid=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

# FR #4107 live check (Wix frame → club domain host folder):
curl -sS -H "Origin: https://www-mymodelflyingclub-co-uk.filesusr.com" \
  "$PartsGatewayApiUrl/parts?widgetGuid=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
# Expect a-clubs/www.mymodelflyingclub.co.uk/ (normalised), never a filesusr.com folder.
```

Repeat the same URL --- first create returns **202** `searching` (idempotent
folder create). Missing `Origin` yields `400` `origin_required`. Widget shows
"Searching for parts..." while `enabled` is `0`, then polls. When embedded
(Wix HTML box), the widget also sends `X-Parent-Origin` so hyphenated club
domains resolve unambiguously.

Bob deploys after MRB PASS + merge (fleet playbook).

## FR #3987 folder events + redqueen

Also creates:

| Resource | Notes |
|----------|--------|
| SQS FIFO `a-clubs-new-folders.fifo` | `MessageGroupId=hostkey`; SSE-SQS; visibility 90s |
| SQS FIFO DLQ `a-clubs-new-folders-dlq.fifo` | maxReceiveCount 5 |
| IAM user `a-search-redqueen-annotator` | consume queue + S3 Get/Put/List on `a-clubs` only |
| Lambda env `A_CLUBS_FOLDER_EVENTS_QUEUE_URL` | gateway publishes host events on new host and new GUID |

Gateway Lambda may **send** only. Redqueen drains outbound over HTTPS (see
`docs/redqueen-annotations.md`). Create access keys for the IAM user out-of-band;
never commit them.

Outputs: `AClubsFolderEventsQueueUrl`, `AClubsFolderEventsDlqUrl`,
`RedqueenAnnotatorUserName`.
