# a-annotator, a-sqlsearch, and a-searches

FR #4827 packages the on-prem drains as Node single-executable applications and installs them as Windows services on walrus. FR #4916 adds the hourly `a-searches` re-search service on the same box.

| Service | Exe | Reads | Writes |
|---|---|---|---|
| `a-annotator` | `dist/sea/a-annotator.exe` | `a-clubs-new-folders.fifo` and `a-clubs-changes` | marker annotations, `searches.json`, POST `/search` |
| `a-sqlsearch` | `dist/sea/a-sqlsearch.exe` | `a-search-db-backed` | `a-clubs/{host}/{guid}/IN/{searchid}-sql.json` on `A_CLUBS_ROOT` |
| `a-searches` | `dist/sea/a-searches.exe` | a-clubs host/GUID markers + `searches.json` / `search-fanout.json` | POST `/search` (IAM SigV4) for GUIDs due by `defaultage` |

All three exes accept `--version` and exit 0 without AWS or SQL. Build them with `npm run build:sea` (`node scripts/build-a-search-sea.js`). On Linux the script downloads the Windows `node.exe` that matches the local Node version, then runs esbuild, `node --experimental-sea-config`, and postject. `--smoke` checks the SEA fuse and, on Windows, runs `--version`.

`msnodesqlv8` is a native addon. It is not inside the blob. Trusted SQL still needs that addon beside the exe (or use SQL auth via pure-JS `mssql`, which is bundled). grok is not bundled; walrus still needs `grok.exe` for reviews.

## Queues

`a-annotator` long-polls with `WaitTimeSeconds` 20 and does not sleep again after an empty receive. Set `A_CLUBS_CHANGES_QUEUE_URL` for the second queue. EventBridge rules on bucket `a-clubs` send Object Created for `widget.json` and `searches.json` straight to `a-clubs-changes` (DLQ `a-clubs-changes-dlq`). Keys ending in `/` go to Lambda `a-search-aclubs-marker-enqueue` (FR #4833), which enqueues only host markers `{hostkey}/` and GUID markers `{hostkey}/{uuid}/` --- deep folder keys are dropped before SQS.

Keys under `IN/` and `search-fanout.json` are skipped. The annotator remembers the ETag of its own PutObject and CopyObject and drops those events.

A `searches.json` edit is posted to `/search` when `{queries, exclude}` hash differs from marker metadata `searcheshash`, or when the file has no `searchid`. The same hash does not post again. A `widget.json` event bumps the GUID marker `lastmod` so the page is reviewed again (host first).

Startup, and then every `REDQUEEN_SWEEP_MS` milliseconds (default 900000), lists markers with `annotated != 1` or `lastmod > lastupdate` and processes hosts before GUIDs.

EventBridge on the existing `a-clubs` bucket is enabled by the **APartsGateway** CDK stack (FR #4890): `Bucket.fromBucketName` + `enableEventBridgeNotification()`. That uses unmanaged `Custom::S3BucketNotifications` (`Managed=false`) so existing Topic/Queue/Lambda notification configs are merged, not replaced. Stack delete leaves EventBridge in place. Do not enable it by hand.

Optional read-only check (no put):

```powershell
.\scripts\Enable-AClubsEventBridge.ps1 -Region eu-west-2 -AwsProfile <profile>
```

## a-searches hourly loop (FR #4916)

`a-searches` is deterministic (no AI). Every hour (`A_SEARCHES_LOOP_MS`, default 3600000) it:

1. Ensures `a-clubs/_root/` exists (self-heal create-only with `defaultage=7`, `name=a-clubs`, `kind=root`).
2. Lists host folders; skips `enabled=0` or `annotated=0`.
3. Resolves age as club host `defaultage` then `_root/` `defaultage` via `shared/defaultAge.js` (no code fallback; invalid existing `_root` fails with `needs_defaultage`).
4. For each GUID, uses marker `lastsearch` or else `search-fanout.json` `at` as the clock. Skips empty / seed `searches.json` (`queries: []`).
5. POSTs `/search` IAM-signed (FR #4888) for due GUIDs. One failure does not stop the others. Missing credentials log a warning and skip the run (service stays up).

Every POST `/search` fans out again (FR #4916 / Simon 2026-10-25): the per-GUID idempotent short-circuit from FR #4265 is removed. Annotator same-hash skip for `searches.json` events is unchanged.

## Install

One script registers all three services with nssm (`SERVICE_AUTO_START`, `AppExit Default Restart`, rotating logs). It removes the legacy service `a-search-walrus-sql-drain` when that service is present. `-Unregister` removes `a-annotator`, `a-sqlsearch`, `a-searches`, and the legacy SQL drain name. Re-running is idempotent. Passwords come from files and are masked in `-WhatIf` output.

```powershell
.\walrus\install\Register-ASearchWalrusServices.ps1 `
  -InstallRoot C:\ai\a-search `
  -FolderQueueUrl <a-clubs-new-folders.fifo url> `
  -ChangesQueueUrl <a-clubs-changes url> `
  -SqsDbBackedUrl <a-search-db-backed url> `
  -AClubsRoot D:\s3\a-clubs `
  -MssqlServer 'walrus\ASEARCH' `
  -SearchApiUrl https://<api>/ `
  -AgentApiKeyFile C:\ai\a-search\secrets\agent.key `
  -ServiceAccount 'WONDERLAND\a-search-drain' `
  -ServicePasswordFile C:\ai\a-search\secrets\service.password
```

Logs land in `InstallRoot\logs\` (`a-annotator.*.log`, `a-sqlsearch.*.log`, `a-searches.*.log`).

The older scripts `redqueen\install\Register-AClubsQueueService.ps1` (`a-search-aclubs-queue`) and `walrus\install\Register-WalrusSqlDrainService.ps1` (`a-search-walrus-sql-drain`) stay for the previous node-based services. Stop `a-search-aclubs-queue` on redqueen after `a-annotator` is the only consumer of the FIFO. Do not redrive `a-clubs-new-folders-dlq.fifo` as part of this cut-over; the sweep picks up folders that are still unannotated.

IAM for the annotator user includes consume on both queues and `s3:CopyObject` on `a-clubs` (marker metadata REPLACE). `a-searches` needs list/head/get on a-clubs plus `s3:PutObject` on `_root/` for self-heal, and execute-api invoke for POST `/search`. New access keys on walrus still need Simon's approval; this document does not mint any.
