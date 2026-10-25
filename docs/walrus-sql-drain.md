# Walrus SQL drain service (FR #4447 / #4511 / #4534 / #4548 / #4570 / #4976 / #5004 / #5023)

On-box Windows service that long-polls `a-search-db-backed` over outbound HTTPS,
runs the SELECT-only `providers/local/sql` worker against the a-search database
on **walrus**, and writes `a-clubs/{host}/{guid}/IN/sql.json` (overwritten each search).
No AWS Lambda connects to MSSQL. No inbound ports on walrus.

## Runtime layout (FR #5022)

The Node drain process loads `walrus/src`, `providers/local/sql`, `shared/`,
and `worker/lib`. Page selection (`filterPartsByPage`) lives in
`shared/widgets/pageSelect.js`. `shared/widgets/promoteInToLive.js` requires
that shared module, so the drain does **not** need `redqueen/src` on the box.
`redqueen/src/pageSelect.js` is a thin re-export for older callers.

FR #4827 / #4997: the SEA package `a-sqlsearch.exe` is the intended replacement,
but trusted SQL needs `msnodesqlv8` loaded via `createRequire(process.execPath)`
from `node_modules` beside the exe. Until
`node scripts/smoke-a-sqlsearch-trusted-select.js --exe dist\sea\a-sqlsearch.exe`
passes on walrus, keep this node service (`a-search-walrus-sql-drain`) running.
`Register-ASearchWalrusServices.ps1` does not remove it unless you pass
`-ReplaceLegacySqlDrain`.

## Deploy / update Node drain code (FR #5023)

After the service is registered, refresh the Node drain tree from a repo checkout
without touching secrets or `walrus\aws`:

```powershell
.\walrus\install\Deploy-WalrusSqlDrain.ps1 `
  -SourceRoot <repo-root> `
  -InstallRoot C:\ai\a-search

# Preview only:
.\walrus\install\Deploy-WalrusSqlDrain.ps1 -WhatIf
```

Checked-in manifest: `walrus/install/walrus-sql-drain-deploy-manifest.json`
(paths: `walrus/src`, `providers`, `shared`, `worker`, `redqueen/src`,
`package.json`, `package-lock.json`, `VERSION`).

Behaviour:

1. Verify every manifest source path exists under `-SourceRoot`.
2. Timestamped backup under `InstallRoot\.deploy-backup\yyyyMMdd-HHmmss\`.
3. Never overwrite `walrus\aws` or `*.password` / credentials files.
4. Copy manifest paths onto `-InstallRoot`.
5. **Load check before service restart**:
   `node walrus/install/assert-walrus-sql-drain-graph.js` (requires
   `walrus/src/index.js`, `drainRunner`, `shared/widgets/promoteInToLive.js`,
   and `redqueen/src/pageSelect.js`). On `MODULE_NOT_FOUND` or throw: restore
   backup, do **not** restart, exit non-zero.
6. `npm install --omit=dev` in `-InstallRoot` (root `package.json`; deps include
   `@a-search/shared` via `file:shared`). Pass `-SkipNpm` to skip.
7. Restart `a-search-walrus-sql-drain`. On start failure: rollback from backup,
   npm install again if needed, restart the previous tree, exit non-zero.

`redqueen/src` is required while `shared/widgets/promoteInToLive.js` does
`require('../../redqueen/src/pageSelect')`. Open #5022 will move `pageSelect`
into `shared`; once that lands, drop `redqueen/src` from the manifest.

Keep the `a-sqlsearch.exe` path (#4997 / #4827) documented above: this deploy
script updates the **legacy Node** drain only. SEA cut-over still uses
`Register-ASearchWalrusServices.ps1` / `-ReplaceLegacySqlDrain` when the trusted
SQL smoke passes.


## Install

```powershell
# SQL auth (LocalSystem + SQL login). Password file is one line; never echoed.
.\walrus\install\Register-WalrusSqlDrainService.ps1 `
  -SqsDbBackedUrl 'https://sqs.eu-west-2.amazonaws.com/ACCOUNT/a-search-db-backed' `
  -AClubsRoot 'D:\s3\a-clubs' `
  -AwsRegion 'eu-west-2' `
  -MssqlServer 'walrus\ASEARCH' `
  -MssqlDatabase 'a_search' `
  -MssqlUser 'a_search_drain' `
  -MssqlPasswordFile 'C:\ai\a-search\walrus\config\mssql.password'

# Trusted connection under a Windows service account (FR #4534 / #4548 / #4570).
# On a domain controller use WONDERLAND\a-search-drain (local .\account is not possible).
# Omit -ServicePasswordFile: the register script skips ObjectName and prints the
# interactive step (nssm needs username+password together; never prompts/stores).
#   nssm set a-search-walrus-sql-drain ObjectName WONDERLAND\a-search-drain
# Trusted SQL uses msnodesqlv8 + ODBC Driver 17 (not Native Client 11.0 / tedious NTLM).
# Optional: -MssqlOdbcDriver 'ODBC Driver 18 for SQL Server' (default is Driver 17).
.\walrus\install\Register-WalrusSqlDrainService.ps1 `
  -SqsDbBackedUrl 'https://sqs.eu-west-2.amazonaws.com/ACCOUNT/a-search-db-backed' `
  -AClubsRoot 'D:\s3\a-clubs' `
  -MssqlServer 'walrus\ASEARCH' `
  -ServiceAccount 'WONDERLAND\a-search-drain' `
  -AwsSharedCredentialsFile 'C:\ai\a-search\walrus\aws\credentials' `
  -AwsConfigFile 'C:\ai\a-search\walrus\aws\config'

# Preview nssm + full AppEnvironmentExtra with secrets masked:
.\walrus\install\Register-WalrusSqlDrainService.ps1 ... -WhatIf
```

`-SqsDbBackedUrl` comes from the CDK stack queue output for `a-search-db-backed`.
Re-running the script rewrites the full `AppEnvironmentExtra` (pass the same
parameters again so hand-set nssm values are not dropped).

## Required service env

| Env | Purpose |
|-----|---------|
| `SQS_DB_BACKED_URL` | Queue URL |
| `A_CLUBS_ROOT` | Mapped a-clubs root |
| `AWS_REGION` | SQS client region (default `eu-west-2`) |
| `AWS_PROFILE` | Named profile for outbound SQS |
| `AWS_SHARED_CREDENTIALS_FILE` | Optional path to credentials file (FR #4534) |
| `AWS_CONFIG_FILE` | Optional path to AWS config file (FR #4534) |
| `A_SEARCH_ENV` | `live` or `sandbox` |
| `MSSQL_SERVER` | Host\instance (e.g. `walrus\ASEARCH`) |
| `MSSQL_DATABASE` | `a_search` or `a_search_sandbox` (never `madeiradb`) |
| `MSSQL_USER` / `MSSQL_PASSWORD` | SQL auth, **or** |
| `MSSQL_TRUSTED_CONNECTION=true` | With `-ServiceAccount` ObjectName |
| `MSSQL_ODBC_DRIVER` | Trusted only (FR #4548). Default `ODBC Driver 17 for SQL Server`. Set by `-MssqlOdbcDriver`. |
| `MSSQL_CONNECTION_STRING` | Optional full ODBC string override (trusted path); wins over built `Driver=` string |

If any required value is missing at process start, the drain prints
`walrus-sql-drain missing config: KEY, ...` and exits **before** any
`ReceiveMessage`, so nothing is pushed to the DLQ.

## Full-text SELECT grant (FR #5004)

`WONDERLAND\a-search-drain` needs **SELECT only** on `a_search.dbo.Parts` so
CONTAINSTABLE can run. Do not grant write privileges. Do not touch madeiradb.

```sql
USE a_search;
GRANT SELECT ON dbo.Parts TO [WONDERLAND\a-search-drain];
-- Confirm as the drain login (read-only):
EXECUTE AS LOGIN = 'WONDERLAND\a-search-drain';
SELECT TOP (1) p.PartId
FROM CONTAINSTABLE(dbo.Parts, (Title, Description), '"servo"') AS ft
INNER JOIN dbo.Parts AS p ON p.PartId = ft.[KEY];
REVERT;
```

The worker sanitises annotator queries (strip punctuation and CONTAINS operators,
drop English noise words, quote remaining tokens, OR includes / AND NOT excludes).
Informational SQL messages (severity < 11, including noise-word notices) are
0-row results, not errors. A real SQL error is logged as
`sql_query_failed number=... message=... contains=...` (never bare `EREQUEST`).

## Failure behaviour (FR #4534)

Connection and query errors are logged per message. The drain releases the
message (`ChangeMessageVisibility` 0) or leaves it to time out. It never
deletes a message that was not processed successfully, and it must not crash
the Node process mid-message (nssm would otherwise restart and redrive until DLQ).

## Logs

`InstallRoot\walrus\logs\walrus-sql-drain.{out,err}.log`

Startup prints one JSON line (queue, aClubsRoot, database). FR #4570: each
processed message adds one INFO JSON line with `searchid`, `host`, `guid`,
`productCount`, `durationMs`, and `outcome` (`written` | `released` | `error`).
No secrets and no query PII beyond host and guid.

## Listing IN files on the rclone mount (FR #4570)

On `D:\s3\a-clubs`, wildcard paths like `D:\s3\a-clubs\*\*\IN` return nothing.
Use a recursive listing or the S3 API:

```powershell
Get-ChildItem -LiteralPath 'D:\s3\a-clubs' -Recurse -Filter 'sql.json'
```

## Per-message outcomes

| outcome | Meaning |
|---------|---------|
| `written` | Job ok; message deleted from SQS |
| `released` | Job returned not-ok; visibility set to 0 for retry |
| `error` | Thrown / bad JSON; visibility released; process keeps running |
