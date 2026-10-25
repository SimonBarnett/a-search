# Daily parts import on walrus (FR #4463)

Deterministic daily import of affiliate + merchant part files from the rclone mounts into `a_search` / Recommended sandbox DB `a_search_sandbox` (FR-146 / FR-251), steered by `providers/local/*/provider.json`.

## Schedule

- Windows Scheduled Task: **`a-search-daily-import`**
- Default trigger: **daily 04:00** (Europe/London local clock)
- `MultipleInstances = IgnoreNew`, `StartWhenAvailable`, execution limit 4 h
- Install: `walrus/install/Register-DailyImportTask.ps1` (supports `-WhatIf`)

```powershell
.\walrus\install\Register-DailyImportTask.ps1 -WhatIf
.\walrus\install\Register-DailyImportTask.ps1
```

## Command

```powershell
node walrus/import/cli.js run
node walrus/import/cli.js run --provider awin --feed 1902
node walrus/import/cli.js run --dry-run --provider shopify --feed shop1
```

Exit codes: `0` ok / nothing to do, `1` one or more feeds failed (agent started), `2` lock held or precheck failed.

## SQL store (FR #4520)

Production uses an mssql-backed store (`walrus/import/src/sqlStore.js`): stage into `dbo.PartsStaging`, `MERGE` into `dbo.Parts`, then soft/hard delete-missing and **clear that feed's staging** (FR #4941). Leftover staging at run start is drained (merge then delete). A run that still has leftover staging fails with `staging_leftover`. `ingest.PartsStaging` is dropped (migration `024_DropIngestPartsStaging.sql`). Set `IMPORT_MEMORY=1` only for unit/dev (in-memory store). Never `madeiradb`.

Required env (same names as the walrus SQL drain, FR #4515):

- `MSSQL_SERVER`, `MSSQL_DATABASE` (`a_search` or `a_search_sandbox`)
- Auth: `MSSQL_TRUSTED_CONNECTION=true` **or** `MSSQL_USER` + `MSSQL_PASSWORD`

```powershell
.\walrus\install\Register-DailyImportTask.ps1 `
  -MssqlServer 'walrus\ASEARCH' `
  -MssqlDatabase a_search_sandbox `
  -MssqlUser import `
  -MssqlPasswordFile C:\secure\import.password
```

## Locks

1. SQL `sp_getapplock` resource `a-search-daily-import` (session-scoped; released if process dies)
2. File lock `%ProgramData%\a-search\import.lock`

## Mounts

- Affiliates: `D:\s3\a-affiliates\{provider}\{affiliateid}\{yyyy-mm-dd}.{ext}`
- Merchants: `D:\s3\a-merchants\{provider}\{merchantid}\parts\{yyyy-mm-dd}.{ext}`

Override with `A_AFFILIATES_ROOT` / `A_MERCHANTS_ROOT`.

## provider.json

Version-controlled under `providers/local/{id}/provider.json`. Schema: `providers/import-provider.schema.json`. No secrets. Search providers (amazon, ebay, rakuten, cj, kelkoo, etsy) must not have one.

## Logs / failures

- Log: `%ProgramData%\a-search\daily-import.log`
- Failure samples: `%ProgramData%\a-search\import\failures\{runId}\{provider}\{feedKey}\`
- Review agent brief: `walrus/import/AGENT.md`

## Purge

Rows in `ingest.PurgeRequests` are hard-deleted for that `(provider, feedKey)` at the start of each run (FR-241 unpaid shops).

## Manual UAT

Sandbox (Recommended FR-146/FR-251 DB `a_search_sandbox`) with real `awin/1902` and one Shopify shop first. Simon gives go before registering the live task.

## Failure issues (FR #4943)

Every failed load opens or comments a GitHub issue on \SimonBarnett/a-search(title \import failure: {provider}/{feedKey}: {errorCode}\, label \import-failure\,
hidden \<!-- import-fp:... -->\ marker). Set \A_SEARCH_GH_TOKEN\ (issues:write).
If GitHub is down, payloads land under \import-failures/<runId>/issue-*.json\ and
are replayed on the next run. \MSSQL_DATABASE\ must be set explicitly (no silent
sandbox default for scheduled runs); use \IMPORT_ALLOW_DEFAULT_DB=1\ only for local tests.

