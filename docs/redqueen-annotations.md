# Redqueen a-clubs queue service (FR #3987 / #4098 / #4147)

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
| `annotated=1` and `lastmod` <= `lastupdate` | skip, unless `REDQUEEN_REANNOTATE=1` |

## Re-annotate (FR #4251)

Set `REDQUEEN_REANNOTATE=1` for one console run of `node redqueen/src/run.js`
(or one service start) to rewrite host and GUID annotations even when
`annotated=1` and `lastmod` <= `lastupdate`. Unset it after that pass so the
poll loop does not rewrite the same markers on every tick. The host marker
must still be on the folder-events queue (replay the host message).

Host `annotation` is an affiliate brief: club specifics, audience, and
affiliate opportunities. GUID `annotation` describes only that page (title,
meta, purpose) using the host brief as context and must not copy it.
`steering` lists the page's narrowing terms plus market, currency and locale.

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
or unavailable (Simon's standing rule). Host review receives fetched text from `https://{host}/`; GUID review receives
fetched text from `https://{host}{uri}` (FR #4147).

Host and page prompts tell the model to answer in one shot from the supplied text only and not to browse, fetch URLs, or use tools (FR #4279). The grok argv also passes `--disable-web-search`. The reviewer timeout stays 120s; receive visibility stays strictly above it (180s) with the visibility heartbeat (FR #4236 / #4246). A GUID `retry` (including reviewer timeout) changes visibility and does not delete the host message, and that GUID's `annotated` stays unset.

A **stub** or unavailable reviewer **must never** set `annotated=1`. The message
returns to the queue (`ChangeMessageVisibility`) until a real reviewer succeeds.

## Drain receive + visibility heartbeat (FR #4236 / #4246)

`drainOnce` receives **one** SQS message at a time (`MaxNumberOfMessages=1`).
The queue is FIFO with one group per host, so batching does not help throughput
and leaves idle receipts on a fixed visibility window while only the current
message is heartbeated. A host+GUID review can exceed 180s; batched receipts
then expire (`ReceiptHandle is invalid ... expired`) before the loop reaches
them (FR #4246).

Receive `VisibilityTimeout` is 180s (strictly greater than the 120s grok
reviewer timeout, FR #4236). While a message is processed, a
`ChangeMessageVisibility` heartbeat keeps extending that same receipt for the
whole host+GUID work.

## Hook point

Optional `REDQUEEN_ON_NEW_FOLDER` env points at a CommonJS module exporting
`onNewFolder({ kind, hostkey, host, guid?, key, uri? })` so other redqueen jobs
can react without a second competing queue consumer.

## Page fetch before review (FR #4147)

Host step fetches `https://{host}/` (follow redirects, timeout, size cap) and
passes readable text to the reviewer. GUID step fetches `https://{host}{uri}`
from the GUID marker metadata. If the fetch fails (DNS, non-2xx, timeout, empty
body), the agent **does not** write an annotation and **does not** set
`annotated=1`; the SQS message stays for retry / DLQ after max receives.

Stub or unavailable reviewers still never set `annotated=1`.

## Windows service on redqueen (nssm)

Bare `sc.exe` wrapping `node.exe` fails with error **1053**. Install with
**nssm** (`C:\ai\bob\third_party\nssm\win64\nssm.exe` or PATH):

```powershell
# From the install tree (e.g. C:\ai\a-search)
cd C:\ai\a-search\redqueen
npm ci --omit=dev
$env:A_CLUBS_FOLDER_EVENTS_QUEUE_URL = 'https://sqs.eu-west-2.amazonaws.com/.../a-clubs-new-folders.fifo'
# Dry-run first (prints nssm commands only):
.\install\Register-AClubsQueueService.ps1 -InstallRoot C:\ai\a-search -WhatIf
# FR #4240: preferred --- LocalSystem + dedicated GROK_HOME (SYSTEM ACL).
# Pointing at Administrator ~/.grok fails with Access is denied on auth.json.
.\install\Register-AClubsQueueService.ps1 -InstallRoot C:\ai\a-search `
    -AwsProfile a-search-redqueen-annotator `
    -GrokHome 'C:\ProgramData\a-search\grok-system-home' `
    -GrokCli 'C:\Users\Administrator\.grok\bin\grok.exe' `
    -AgentCli 'C:\Users\Administrator\AppData\Local\cursor-agent\agent.cmd'
# First time: follow the printed one-shot SYSTEM `grok login --device-auth`
# instructions so GROK_HOME\auth.json exists.
# Alternative: -Credential / redqueen\config\service.password for admin ObjectName.
# -AllowLocalSystem only for tests / AWS-only drains without grok reviewers.
Start-Service a-search-aclubs-queue
```

The script is idempotent (`nssm install` / `nssm set`), auto-start, restart on
failure, AppDirectory = InstallRoot, Application = node, AppParameters =
`redqueen\src\run.js`. Environment includes `AWS_PROFILE` (never root keys),
optional `GROK_CLI` / `AGENT_CLI`, and with `-GrokHome` also `USERPROFILE` /
`HOME` / `GROK_HOME` under a SYSTEM+Administrators ACL (FR #4240). With
`-GrokCli`, install refuses bare LocalSystem unless `-GrokHome`, `-Credential` /
`service.password`, or `-AllowLocalSystem`. The install summary prints
**Logon:** `LocalSystem` or `Credential (user)`.
Stdout/stderr rotate under `C:\ai\a-search\redqueen\logs\` with no secrets.
Compatible with Windows PowerShell 5.1 (FR #4164: nssm args must not use `$Args`).
There is no reliable Cursor fallback when `A_SEARCH_CURSOR_BIN` points at
`.grok\bin\agent.exe` (that binary is grok); point `-AgentCli` at the real
`cursor-agent\agent.cmd` if a fallback is needed.

Manual console:

```powershell
cd C:\ai\a-search\redqueen
npm ci --omit=dev
$env:AWS_PROFILE = 'a-search-redqueen-annotator'
$env:A_CLUBS_FOLDER_EVENTS_QUEUE_URL = 'https://sqs.eu-west-2.amazonaws.com/.../a-clubs-new-folders.fifo'
$env:A_CLUBS_BUCKET = 'a-clubs'
$env:AWS_REGION = 'eu-west-2'
$env:REDQUEEN_LOG_FILE = 'C:\ai\a-search\redqueen\logs\aclubs-queue.out.log'
node src\run.js
```

After merge, Bob installs on redqueen and live-tests My Model Flying Club
(`Origin https://www.mymodelflyingclub.co.uk`, GUID `/membersproductrequests`).
Synthetic `test.smartcatalogue.uk` messages should fail fetch cleanly into the DLQ
without `annotated=1`.

## IAM

| Principal | Permissions |
|-----------|-------------|
| Parts-gateway Lambda | `sqs:SendMessage` on the FIFO only; S3 R/W on `a-clubs` |
| `a-search-redqueen-annotator` | `sqs:ReceiveMessage` / `DeleteMessage` / `ChangeMessageVisibility` on the FIFO; S3 `GetObject` / `PutObject` / `ListBucket` / `GetObjectTagging` / `PutObjectTagging` plus object-annotation actions `s3:PutObjectAnnotation` / `s3:GetObjectAnnotation` / `s3:ListObjectAnnotations` / `s3:DeleteObjectAnnotation` on `arn:aws:s3:::a-clubs` and `arn:aws:s3:::a-clubs/*` (FR #4122 / #4241) |

Never use root keys. Redeploy **APartsGateway** after #4122 so the annotator user policy is live before installing the redqueen queue service.

## Related

- FR #3968 --- parts gateway auto-creates host/GUID folder markers
- FR #3987 --- FIFO push + first drain
- FR #4098 --- object annotations, real reviewers, Windows service
- FR #4043 / #4087 --- folder tools that read the same object annotations
