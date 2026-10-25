# Walrus SQL drain service (FR #4447 / #4511 / #4534 / #4548 / #4570)

On-box Windows service that long-polls `a-search-db-backed` over outbound HTTPS,
runs the SELECT-only `providers/local/sql` worker against the a-search database
on **walrus**, and writes `a-clubs/{host}/{guid}/IN/sql.json` (overwritten each search).
No AWS Lambda connects to MSSQL. No inbound ports on walrus.

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
