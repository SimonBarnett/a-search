# Walrus SQL drain service (FR #4447 / #4511)

On-box Windows service that long-polls `a-search-db-backed` over outbound HTTPS,
runs the SELECT-only `providers/local/sql` worker against the a-search database
on **walrus**, and writes `a-clubs/{host}/{guid}/IN/{searchid}-sql.json`.
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

# Or trusted connection under a Windows service account with a SQL login:
.\walrus\install\Register-WalrusSqlDrainService.ps1 `
  -SqsDbBackedUrl 'https://sqs.eu-west-2.amazonaws.com/ACCOUNT/a-search-db-backed' `
  -AClubsRoot 'D:\s3\a-clubs' `
  -MssqlServer 'walrus\ASEARCH' `
  -ServiceAccount '.\a-search-drain' `
  -ServicePasswordFile 'C:\ai\a-search\walrus\config\service.password'

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
| `A_SEARCH_ENV` | `live` or `sandbox` |
| `MSSQL_SERVER` | Host\instance (e.g. `walrus\ASEARCH`) |
| `MSSQL_DATABASE` | `a_search` or `a_search_sandbox` (never `madeiradb`) |
| `MSSQL_USER` / `MSSQL_PASSWORD` | SQL auth, **or** |
| `MSSQL_TRUSTED_CONNECTION=true` | With `-ServiceAccount` ObjectName |

If any required value is missing at process start, the drain prints
`walrus-sql-drain missing config: KEY, ...` and exits **before** any
`ReceiveMessage`, so nothing is pushed to the DLQ.

## Logs

`InstallRoot\walrus\logs\walrus-sql-drain.{out,err}.log`
