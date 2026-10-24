#Requires -Version 5.1
<#
.SYNOPSIS
  Register a-annotator and a-sqlsearch as Windows services via nssm (FR #4827).

.DESCRIPTION
  Idempotent installer for both SEA exes. SERVICE_AUTO_START, restart on failure,
  rotating logs under InstallRoot\logs. Removes legacy service a-search-walrus-sql-drain
  when it is installed. -Unregister removes a-annotator, a-sqlsearch, and that legacy name.
  Compatible with Windows PowerShell 5.1. Never prints passwords or API keys.

.PARAMETER InstallRoot
  Folder that contains dist\sea\a-annotator.exe and dist\sea\a-sqlsearch.exe.

.PARAMETER AnnotatorExe
  Override path to a-annotator.exe.

.PARAMETER SqlSearchExe
  Override path to a-sqlsearch.exe.

.PARAMETER NssmExe
  Path to nssm.exe. Default C:\ai\bob\third_party\nssm\win64\nssm.exe or PATH.

.PARAMETER AwsProfile
  Named profile for a-annotator (default a-search-redqueen-annotator).

.PARAMETER SqlAwsProfile
  Named profile for a-sqlsearch (default a-search-walrus-sql-drain).

.PARAMETER AwsRegion
  Default eu-west-2.

.PARAMETER FolderQueueUrl
  A_CLUBS_FOLDER_EVENTS_QUEUE_URL (a-clubs-new-folders.fifo).

.PARAMETER ChangesQueueUrl
  A_CLUBS_CHANGES_QUEUE_URL.

.PARAMETER SqsDbBackedUrl
  SQS_DB_BACKED_URL for a-sqlsearch.

.PARAMETER AClubsRoot
  Mapped a-clubs root for the SQL drain (A_CLUBS_ROOT).

.PARAMETER AClubsBucket
  Default a-clubs.

.PARAMETER SearchApiUrl
  A_SEARCH_API_URL for POST /search. Not a secret.

.PARAMETER AgentApiKeyFile
  Path only (A_SEARCH_AGENT_API_KEY_FILE). The file contents are never read or printed.

.PARAMETER MssqlServer
  SQL host, e.g. walrus\ASEARCH.

.PARAMETER MssqlDatabase
  a_search or a_search_sandbox. madeiradb is rejected.

.PARAMETER MssqlUser
  SQL login. Pair with -MssqlPasswordFile. Do not combine with -ServiceAccount.

.PARAMETER MssqlPasswordFile
  One-line password file. The value is placed in nssm AppEnvironmentExtra and masked in -WhatIf.

.PARAMETER ServiceAccount
  Windows account for a-sqlsearch ObjectName (trusted SQL). Optional for a-annotator
  via -AnnotatorAccount (default LocalSystem, no ObjectName).

.PARAMETER ServicePasswordFile
  Password file for ObjectName. Omitted: ObjectName is skipped and the interactive
  nssm command is printed. The password is never written to AppEnvironmentExtra.

.PARAMETER AnnotatorAccount
  Optional ObjectName for a-annotator. Uses -ServicePasswordFile when set.

.PARAMETER GrokBin
  Optional A_SEARCH_GROK_BIN.

.PARAMETER GrokHome
  Optional GROK_HOME / USERPROFILE / HOME for the annotator.

.PARAMETER WhatIf
  Print nssm commands with secrets masked. Do not change the machine.

.PARAMETER Unregister
  Stop and remove a-annotator, a-sqlsearch, and a-search-walrus-sql-drain.
#>
[CmdletBinding(SupportsShouldProcess = $false)]
param(
  [string]$InstallRoot = 'C:\ai\a-search',
  [string]$AnnotatorExe,
  [string]$SqlSearchExe,
  [string]$NssmExe,
  [string]$AwsProfile = 'a-search-redqueen-annotator',
  [string]$SqlAwsProfile = 'a-search-walrus-sql-drain',
  [string]$AwsRegion = 'eu-west-2',
  [string]$FolderQueueUrl,
  [string]$ChangesQueueUrl,
  [string]$SqsDbBackedUrl,
  [string]$AClubsRoot,
  [string]$AClubsBucket = 'a-clubs',
  [ValidateSet('', 'live', 'sandbox')]
  [string]$ASearchEnv = 'live',
  [string]$SearchApiUrl,
  [string]$AgentApiKeyFile,
  [string]$MssqlServer,
  [string]$MssqlDatabase,
  [string]$MssqlUser,
  [string]$MssqlPasswordFile,
  [string]$ServiceAccount,
  [string]$ServicePasswordFile,
  [string]$AnnotatorAccount,
  [string]$MssqlOdbcDriver = 'ODBC Driver 17 for SQL Server',
  [string]$AwsSharedCredentialsFile,
  [string]$AwsConfigFile,
  [string]$GrokBin,
  [string]$GrokHome,
  [string]$SweepMs = '900000',
  [Alias('DryRun')][switch]$WhatIf,
  [switch]$Unregister
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$DryRun = [bool]$WhatIf
$AnnotatorService = 'a-annotator'
$SqlService = 'a-sqlsearch'
$LegacySqlService = 'a-search-walrus-sql-drain'

function Resolve-NssmPath {
  param([string]$NssmExe)
  if ($NssmExe -and (Test-Path -LiteralPath $NssmExe)) {
    return (Resolve-Path -LiteralPath $NssmExe).Path
  }
  $default = 'C:\ai\bob\third_party\nssm\win64\nssm.exe'
  if (Test-Path -LiteralPath $default) { return $default }
  $cmd = Get-Command nssm -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw 'nssm_required: install nssm or pass -NssmExe (expected C:\ai\bob\third_party\nssm\win64\nssm.exe)'
}

function Read-SecretFile {
  param([string]$Path)
  if (-not $Path) { return $null }
  if (-not (Test-Path -LiteralPath $Path)) { throw "secret_file_missing: $Path" }
  $raw = [System.IO.File]::ReadAllText($Path).Trim()
  if (-not $raw) { throw "secret_file_empty: $Path" }
  return $raw
}

function Format-MaskedArg {
  param([string]$Arg)
  if ($Arg -match '^(MSSQL_PASSWORD|AWS_SECRET_ACCESS_KEY|A_SEARCH_AGENT_API_KEY)=') {
    return ($Arg -replace '=.*$', '=***')
  }
  return $Arg
}

function Invoke-Nssm {
  param([string]$Nssm, [string[]]$NssmArgs)
  $display = foreach ($a in $NssmArgs) { Format-MaskedArg -Arg $a }
  if ($DryRun) {
    Write-Host ('[DryRun] nssm ' + ($display -join ' '))
    return 0
  }
  & $Nssm @NssmArgs | Out-Host
  return [int]$LASTEXITCODE
}

function Remove-NssmService {
  param([string]$Nssm, [string]$Name)
  $existing = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $existing -and -not $DryRun) { return }
  $null = Invoke-Nssm -Nssm $Nssm -NssmArgs @('stop', $Name)
  $code = Invoke-Nssm -Nssm $Nssm -NssmArgs @('remove', $Name, 'confirm')
  if ($code -ne 0 -and -not $DryRun) {
    Write-Warning "nssm remove $Name exited $code (service may already be absent)"
  }
  Write-Host "Unregistered $Name"
}

function Add-Env {
  param($List, [string]$Key, [string]$Value)
  if ($null -eq $Value) { return }
  if ($Value -eq '') { return }
  [void]$List.Add("$Key=$Value")
}

$nssm = Resolve-NssmPath -NssmExe $NssmExe

if ($Unregister) {
  Remove-NssmService -Nssm $nssm -Name $AnnotatorService
  Remove-NssmService -Nssm $nssm -Name $SqlService
  Remove-NssmService -Nssm $nssm -Name $LegacySqlService
  return
}

if (-not $AnnotatorExe) {
  $AnnotatorExe = Join-Path $InstallRoot 'dist\sea\a-annotator.exe'
}
if (-not $SqlSearchExe) {
  $SqlSearchExe = Join-Path $InstallRoot 'dist\sea\a-sqlsearch.exe'
}

if (-not $FolderQueueUrl) { throw 'FolderQueueUrl_required' }
if (-not $ChangesQueueUrl) { throw 'ChangesQueueUrl_required' }
if (-not $SqsDbBackedUrl) { throw 'SqsDbBackedUrl_required' }
if (-not $AClubsRoot) { throw 'AClubsRoot_required' }
if (-not $MssqlServer) { throw 'MssqlServer_required' }
if (-not $SearchApiUrl) { throw 'SearchApiUrl_required' }

if (-not $MssqlDatabase) {
  if ($ASearchEnv -eq 'sandbox') { $MssqlDatabase = 'a_search_sandbox' }
  else { $MssqlDatabase = 'a_search' }
}
$dbNorm = $MssqlDatabase.Trim().ToLowerInvariant()
if ($dbNorm -eq 'madeiradb') {
  throw 'madeiradb_read_only: MSSQL_DATABASE must be a_search or a_search_sandbox'
}
if ($dbNorm -ne 'a_search' -and $dbNorm -ne 'a_search_sandbox') {
  throw "MSSQL_DATABASE_invalid: expected a_search or a_search_sandbox, got $MssqlDatabase"
}

$useTrusted = [bool]$ServiceAccount
$mssqlPassword = $null
if ($useTrusted) {
  if ($MssqlUser -or $MssqlPasswordFile) {
    throw 'auth_conflict: use either -ServiceAccount (trusted) or -MssqlUser/-MssqlPasswordFile, not both'
  }
} else {
  if (-not $MssqlUser) { throw 'MssqlUser_required: pass -MssqlUser and -MssqlPasswordFile, or -ServiceAccount' }
  if (-not $MssqlPasswordFile) { throw 'MssqlPasswordFile_required' }
  $mssqlPassword = Read-SecretFile -Path $MssqlPasswordFile
}

if (-not $DryRun) {
  if (-not (Test-Path -LiteralPath $AnnotatorExe)) { throw "annotator_exe_missing: $AnnotatorExe" }
  if (-not (Test-Path -LiteralPath $SqlSearchExe)) { throw "sqlsearch_exe_missing: $SqlSearchExe" }
}

$logDir = Join-Path $InstallRoot 'logs'
if (-not $DryRun) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}

# Legacy node service on this box is replaced by a-sqlsearch.
Remove-NssmService -Nssm $nssm -Name $LegacySqlService

$annEnv = New-Object System.Collections.Generic.List[string]
Add-Env $annEnv 'AWS_PROFILE' $AwsProfile
Add-Env $annEnv 'AWS_REGION' $AwsRegion
Add-Env $annEnv 'AWS_SHARED_CREDENTIALS_FILE' $AwsSharedCredentialsFile
Add-Env $annEnv 'AWS_CONFIG_FILE' $AwsConfigFile
Add-Env $annEnv 'A_CLUBS_BUCKET' $AClubsBucket
Add-Env $annEnv 'A_CLUBS_FOLDER_EVENTS_QUEUE_URL' $FolderQueueUrl
Add-Env $annEnv 'A_CLUBS_CHANGES_QUEUE_URL' $ChangesQueueUrl
Add-Env $annEnv 'A_SEARCH_API_URL' $SearchApiUrl
Add-Env $annEnv 'A_SEARCH_AGENT_API_KEY_FILE' $AgentApiKeyFile
Add-Env $annEnv 'REDQUEEN_SWEEP_MS' $SweepMs
Add-Env $annEnv 'A_SEARCH_GROK_BIN' $GrokBin
if ($GrokHome) {
  Add-Env $annEnv 'GROK_HOME' $GrokHome
  Add-Env $annEnv 'USERPROFILE' $GrokHome
  Add-Env $annEnv 'HOME' $GrokHome
}

$sqlEnv = New-Object System.Collections.Generic.List[string]
Add-Env $sqlEnv 'AWS_PROFILE' $SqlAwsProfile
Add-Env $sqlEnv 'AWS_REGION' $AwsRegion
Add-Env $sqlEnv 'AWS_SHARED_CREDENTIALS_FILE' $AwsSharedCredentialsFile
Add-Env $sqlEnv 'AWS_CONFIG_FILE' $AwsConfigFile
Add-Env $sqlEnv 'SQS_DB_BACKED_URL' $SqsDbBackedUrl
Add-Env $sqlEnv 'A_CLUBS_ROOT' $AClubsRoot
if ($ASearchEnv) { Add-Env $sqlEnv 'A_SEARCH_ENV' $ASearchEnv }
Add-Env $sqlEnv 'MSSQL_SERVER' $MssqlServer
Add-Env $sqlEnv 'MSSQL_DATABASE' $MssqlDatabase
if ($useTrusted) {
  Add-Env $sqlEnv 'MSSQL_TRUSTED_CONNECTION' 'true'
  $odbc = $MssqlOdbcDriver
  if (-not $odbc) { $odbc = 'ODBC Driver 17 for SQL Server' }
  Add-Env $sqlEnv 'MSSQL_ODBC_DRIVER' $odbc.Trim()
} else {
  Add-Env $sqlEnv 'MSSQL_USER' $MssqlUser
  Add-Env $sqlEnv 'MSSQL_PASSWORD' $mssqlPassword
}

function Install-OneService {
  param(
    [string]$Nssm,
    [string]$Name,
    [string]$Exe,
    [string]$DisplayName,
    [string]$Description,
    [string]$Stdout,
    [string]$Stderr,
    [string[]]$EnvPairs
  )
  $existing = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if ($existing) {
    $code = Invoke-Nssm -Nssm $Nssm -NssmArgs @('set', $Name, 'Application', $Exe)
    if ($code -ne 0) { throw "nssm set Application failed: $Name $code" }
  } else {
    $code = Invoke-Nssm -Nssm $Nssm -NssmArgs @('install', $Name, $Exe)
    if ($code -ne 0) { throw "nssm install failed: $Name $code" }
  }
  $sets = @(
    @('AppDirectory', $InstallRoot),
    @('DisplayName', $DisplayName),
    @('Description', $Description),
    @('Start', 'SERVICE_AUTO_START'),
    @('AppStdout', $Stdout),
    @('AppStderr', $Stderr),
    @('AppRotateFiles', '1'),
    @('AppRotateBytes', '10485760'),
    @('AppExit', 'Default', 'Restart'),
    @('AppRestartDelay', '5000')
  )
  foreach ($s in $sets) {
    $code = Invoke-Nssm -Nssm $Nssm -NssmArgs (@('set', $Name) + $s)
    if ($code -ne 0) { throw "nssm set $($s[0]) failed: $Name $code" }
  }
  $code = Invoke-Nssm -Nssm $Nssm -NssmArgs (@('set', $Name, 'AppEnvironmentExtra') + $EnvPairs)
  if ($code -ne 0) { throw "nssm set AppEnvironmentExtra failed: $Name $code" }
  if (-not $DryRun) {
    Start-Service -Name $Name -ErrorAction SilentlyContinue
  }
  Write-Host "Registered $Name -> $Exe"
}

function Set-ObjectNameIfPassword {
  param([string]$Nssm, [string]$Name, [string]$Account)
  if (-not $Account) { return }
  $svcPass = $null
  if ($ServicePasswordFile) { $svcPass = Read-SecretFile -Path $ServicePasswordFile }
  if ($svcPass) {
    if ($DryRun) {
      Write-Host "[DryRun] nssm set $Name ObjectName $Account ***"
    } else {
      $null = & $Nssm set $Name ObjectName $Account $svcPass 2>&1 | Out-Null
      $code = [int]$LASTEXITCODE
      if ($code -ne 0) { throw "nssm ObjectName failed: $Name $code" }
    }
  } else {
    Write-Host "ObjectName skipped (no -ServicePasswordFile). Run interactively next:"
    Write-Host "  nssm set $Name ObjectName $Account"
    Write-Host "  (nssm prompts for the account password; do not pass it on the command line)"
  }
}

Install-OneService -Nssm $nssm -Name $AnnotatorService -Exe $AnnotatorExe `
  -DisplayName 'a-annotator' `
  -Description 'FR #4827: a-clubs annotator (folder FIFO + a-clubs-changes)' `
  -Stdout (Join-Path $logDir 'a-annotator.out.log') `
  -Stderr (Join-Path $logDir 'a-annotator.err.log') `
  -EnvPairs $annEnv.ToArray()
Set-ObjectNameIfPassword -Nssm $nssm -Name $AnnotatorService -Account $AnnotatorAccount

Install-OneService -Nssm $nssm -Name $SqlService -Exe $SqlSearchExe `
  -DisplayName 'a-sqlsearch' `
  -Description 'FR #4827: walrus SQL drain; write a-clubs IN/' `
  -Stdout (Join-Path $logDir 'a-sqlsearch.out.log') `
  -Stderr (Join-Path $logDir 'a-sqlsearch.err.log') `
  -EnvPairs $sqlEnv.ToArray()
Set-ObjectNameIfPassword -Nssm $nssm -Name $SqlService -Account $ServiceAccount

Write-Host "Registered $AnnotatorService and $SqlService (InstallRoot=$InstallRoot)"
