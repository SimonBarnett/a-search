# Redqueen a-clubs annotation agent (FR #3987)

Outbound-only agent on redqueen that annotates a-clubs HOST and GUID folders
created by the AWS parts gateway (FR #3968). No inbound ports on redqueen or walrus.

## Event schema (SQS FIFO)

Queue: `a-clubs-new-folders.fifo` (`MessageGroupId = hostkey`, DLQ
`a-clubs-new-folders-dlq.fifo`, SSE-SQS).

Gateway publishes a **host** message for every **new host** and every **new GUID**:

```json
{ "hostkey": "shop.example.com", "host": "shop.example.com", "createdAt": "2026-10-18T10:00:00.000Z" }
```

There are no GUID event types. Redqueen lists `{hostkey}/{guid}/widget.json`
keys under the host after processing the host step.

## Annotation rules (annotated + lastmod / lastupdate)

For the host marker, then each GUID `widget.json` marker:

| State | Action |
|-------|--------|
| no `annotated=1` | create `annotations.json`, set `annotated=1`, set `lastupdate` and `lastmod` to the same ISO UTC timestamp |
| `annotated=1` and `lastmod` > `lastupdate` | regenerate annotations, refresh `lastupdate` (= `lastmod`) |
| `annotated=1` and `lastmod` <= `lastupdate` | skip |

The agent writes `lastupdate` and `lastmod` together so its own annotation write
does not look like a content change and loop.

Host before GUID: GUIDs are only processed after the host step leaves the host
annotated and up to date, and after `a-clubs/{hostkey}/annotations.json` can be
read. If the host review fails or annotations are missing, the message returns
to the queue (visibility timeout) and no GUIDs are touched.

## Files written

- Host: `a-clubs/{hostkey}/annotations.json` --- `{host, reviewedAt, model, summary, categories, notes}`
- GUID: `a-clubs/{hostkey}/{guid}/annotations.json` --- `{uri, annotatedAt, model, summary, intent, suggestedQueries, steering}`
- Steering (optional input): `a-clubs/{hostkey}/{guid}/steering.json` (user-entered; how users edit it is a follow-up)

## GUID marker metadata (gateway, FR #3968 / #3987)

On create, `widget.json` user metadata includes:

- `uri` --- page path from `Referer` (preferred) or `pageUri` / `uri` query param
- `seen` --- `0`
- `clicks` --- `0`
- `since` --- ISO 8601 UTC create time
- `lastmod` --- ISO 8601 UTC
- `annotated` --- `0` until redqueen sets `1`

Incrementing `seen` / `clicks` is a follow-up FR.

## Install / run on redqueen

1. Deploy `APartsGateway` (creates the FIFO queue, DLQ, Lambda env
   `A_CLUBS_FOLDER_EVENTS_QUEUE_URL`, and IAM user `a-search-redqueen-annotator`).
2. Create access keys for that IAM user out-of-band (never commit or print them).
3. On redqueen, configure AWS credentials for that user and:

```bash
export A_CLUBS_FOLDER_EVENTS_QUEUE_URL="https://sqs.eu-west-2.amazonaws.com/.../a-clubs-new-folders.fifo"
export A_CLUBS_BUCKET=a-clubs
export AWS_REGION=eu-west-2
node redqueen/src/run.js
```

`run.js` polls with `ReceiveMessage` (long poll) and deletes on success. Retries
leave the message invisible briefly via `ChangeMessageVisibility`.

### Reviewer model

Default reviewers are stubs (`model: "stub"`). Inject real reviewers by wrapping
`processFolderEvent` / `drainOnce` with `reviewHost` and `reviewGuid` callables
(Grok/Cursor CLI or any HTTP model). Open question left for Simon: which seat/CLI
is production.

## IAM

| Principal | Permissions |
|-----------|-------------|
| Parts-gateway Lambda | `sqs:SendMessage` on the FIFO only; S3 R/W on `a-clubs` |
| `a-search-redqueen-annotator` | `sqs:ReceiveMessage` / `DeleteMessage` / `ChangeMessageVisibility` on the FIFO; S3 Get/Put/List on `a-clubs` only |

Never use root keys.

## Related

- FR #3968 --- parts gateway auto-creates host/GUID folders
- FR #3987 --- this agent + FIFO push
