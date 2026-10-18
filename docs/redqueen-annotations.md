# Redqueen a-clubs queue service (FR #3987 / #4098)

Outbound-only agent on redqueen that annotates a-clubs HOST and GUID folders
created by the AWS parts gateway (FR #3968). No inbound ports on redqueen or walrus.

## Event schema (SQS FIFO)

Queue: `a-clubs-new-folders.fifo` (`MessageGroupId = hostkey`, DLQ
`a-clubs-new-folders-dlq.fifo`, SSE-SQS).

Gateway publishes a **host** message for every **new host** and every **new GUID**:

```json
{ "hostkey": "shop.example.com", "host": "shop.example.com", "createdAt": "2026-10-18T10:00:00.000Z" }
```

There are no GUID event types. Redqueen lists zero-byte `{hostkey}/{guid}/`
folder markers under the host after processing the host step (not `widget.json`).

## Annotation rules (annotated + lastmod / lastupdate)

For the host marker, then each GUID folder marker:

| State | Action |
|-------|--------|
| no `annotated=1` | write object annotations, set `annotated=1`, set `lastupdate` and `lastmod` to the same ISO UTC timestamp |
| `annotated=1` and `lastmod` > `lastupdate` | regenerate annotations, refresh `lastupdate` (= `lastmod`) |
| `annotated=1` and `lastmod` <= `lastupdate` | skip |

The agent writes `lastupdate` and `lastmod` together so its own annotation write
does not look like a content change and loop.

Host before GUID: GUIDs are only processed after the host step leaves the host
annotated and up to date, and after the host marker carries an `annotation`
object annotation. If the host review fails or annotations are missing, the
message returns to the queue (visibility timeout) and no GUIDs are touched.

## Object annotations (not JSON sidecars)

Annotations are **S3 object annotations** on the folder markers
(`PutObjectAnnotation` / `GetObjectAnnotation` / `ListObjectAnnotations`):

- Host marker `a-clubs/{hostkey}/`: annotation name `annotation`
- GUID marker `a-clubs/{hostkey}/{guid}/`: `annotation`, and `steering` when present

**Never** write `annotations.json` or `steering.json`. Metadata fields
`annotated`, `lastupdate`, and `lastmod` stay on the marker and are set together.
After a metadata copy-in-place, the agent re-lists annotations and re-applies
them if the rewrite dropped them.

## Reviewers (Grok first)

Production reviewers call Grok first, then Cursor only when Grok is exhausted
or unavailable (Simon's standing rule). Host review reads the host site; GUID
review reads page `uri` from the GUID marker metadata.

A **stub** or unavailable reviewer **must never** set `annotated=1`. The message
returns to the queue (`ChangeMessageVisibility`) until a real reviewer succeeds.

## Hook point

Optional `REDQUEEN_ON_NEW_FOLDER` env points at a CommonJS module exporting
`onNewFolder({ kind, hostkey, host, guid?, key, uri? })` so other redqueen jobs
can react without a second competing queue consumer.

## Windows service on redqueen

```powershell
# From the install tree (e.g. C:\ai\a-search)
$env:A_CLUBS_FOLDER_EVENTS_QUEUE_URL = 'https://sqs.eu-west-2.amazonaws.com/.../a-clubs-new-folders.fifo'
.\redqueen\install\Register-AClubsQueueService.ps1 -InstallRoot C:\ai\a-search
Start-Service a-search-aclubs-queue
```

The script is idempotent (create or `sc.exe config`), auto-start, restart on
failure, runs `node redqueen\src\run.js` under `AWS_PROFILE=a-search-redqueen-annotator`
(never root keys). Logs to `%ProgramData%\a-search\aclubs-queue.log` with no secrets.
Compatible with Windows PowerShell 5.1.

Manual console:

```powershell
$env:AWS_PROFILE = 'a-search-redqueen-annotator'
$env:A_CLUBS_FOLDER_EVENTS_QUEUE_URL = 'https://sqs.eu-west-2.amazonaws.com/.../a-clubs-new-folders.fifo'
$env:A_CLUBS_BUCKET = 'a-clubs'
$env:AWS_REGION = 'eu-west-2'
$env:REDQUEEN_LOG_FILE = "$env:ProgramData\a-search\aclubs-queue.log"
node redqueen\src\run.js
```

After merge, Bob installs on redqueen and verifies against test host
`test.smartcatalogue.uk` (message already in the queue).

## IAM

| Principal | Permissions |
|-----------|-------------|
| Parts-gateway Lambda | `sqs:SendMessage` on the FIFO only; S3 R/W on `a-clubs` |
| `a-search-redqueen-annotator` | `sqs:ReceiveMessage` / `DeleteMessage` / `ChangeMessageVisibility` on the FIFO; S3 Get/Put/List + `s3:PutObjectAnnotation` / `GetObjectAnnotation` / `ListObjectAnnotations` on `a-clubs` only |

Never use root keys.

## Related

- FR #3968 --- parts gateway auto-creates host/GUID folder markers
- FR #3987 --- FIFO push + first drain
- FR #4098 --- object annotations, real reviewers, Windows service
- FR #4043 / #4087 --- folder tools that read the same object annotations
