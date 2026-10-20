#Requires -Version 5.1
<#
.SYNOPSIS
  Register the walrus SQL SQS drain as a Windows service via nssm (FR #4447 / #4511).

.DESCRIPTION
  Idempotent: installs/updates service "a-search-walrus-sql-drain" with nssm wrapping
  `node walrus\src\index.js` from InstallRoot (default C:\ai\a-search).
  Auto-start, restart on failure. Outbound HTTPS SQS only --- no inbound port.
  Logs to InstallRoot\walrus\logs\. Bare sc.exe + node.exe is rejected (error 1053);
  nssm is required. Compatible with Windows PowerShell 5.1.

  FR #4511: AppEnvironmentExtra must include every env the drain reads
  (SQS_DB_BACKED_URL, AWS_REGION, MSSQL_SERVER, SQL auth, A_CLUBS_ROOT, ...).
  Re-running this script rewrites the full env so hand-set nssm values are not lost
  only when you pass the same parameters again.

.PARAMETER InstallRoot
  Stable install folder containing walrus\src\index.js.

.PARAMETER ServiceName
  Windows service name (default a-search-walrus-sql-drain).

.PARAMETER NodeExe
  Path to node.exe.

.PARAMETER AwsProfile
  Named AWS profile for outbound SQS (default a-search-walrus-sql-drain).

.PARAMETER AwsRegion
  AWS region for the SQS client (default eu-west-2).

.PARAMETER SqsDbBackedUrl
  Queue URL for a-search-db-backed (stack output). Required unless Unregister.

.PARAMETER AClubsRoot
  Mapped a-clubs root (sets A_CLUBS_ROOT). Required unless Unregister.

.PARAMETER ASearchEnv
  live|sandbox (sets A_SEARCH_ENV). Default live.

.PARAMETER MssqlServer
  SQL host (e.g. walrus\ASEARCH). Required unless Unregister.

.PARAMETER MssqlDatabase
  a_search or a_search_sandbox (sets MSSQL_DATABASE). Never madeiradb for writers.
  Default a_search when ASearchEnv=live, else a_search_sandbox.

.PARAMETER MssqlUser
  SQL login for LocalSystem + SQL auth. Pair with -MssqlPasswordFile.

.PARAMETER MssqlPasswordFile
  Path to a one-line password file (never echoed). Sets MSSQL_PASSWORD in nssm env.

.PARAMETER ServiceAccount
  Windows account for nssm ObjectName (trusted SQL connection). Sets
  MSSQL_TRUSTED_CONNECTION=true. -ServicePasswordFile is optional: omit it and
  set the password via nssm interactively (FR #4534). Never write the service
  password into AppEnvironmentExtra or the registry from this script.

.PARAMETER ServicePasswordFile
  Optional password file for -ServiceAccount ObjectName (never echoed). Prefer
  interactive nssm ObjectName when the operator sets the password by hand.

.PARAMETER MssqlOdbcDriver
  ODBC driver name for trusted msnodesqlv8 (FR #4548). Sets MSSQL_ODBC_DRIVER.
  Default: ODBC Driver 17 for SQL Server (Native Client 11.0 is often missing).

.PARAMETER AwsSharedCredentialsFile
  Optional path for AWS_SHARED_CREDENTIALS_FILE (e.g. C:\ai\a-search\walrus\aws\credentials).

.PARAMETER AwsConfigFile
  Optional path for AWS_CONFIG_FILE (e.g. C:\ai\a-search\walrus\aws\config).

.PARAMETER NssmExe
  Path to nssm.exe (default: C:\ai\bob\third_party\nssm\win64\nssm.exe or PATH).

.PARAMETER WhatIf
  Alias DryRun: print nssm commands and the full AppEnvironmentExtra with secrets
  masked; do not change the machine.

.PARAMETER Unregister
  Remove the service via nssm.
#>
[CmdletBinding(SupportsShouldProcess = $false)]
param(
  [string]$InstallRoot = 'C:\ai\a-search',
  [string]$ServiceName = 'a-search-walrus-sql-drain',
  [string]$NodeExe = 'node',
  [string]$AwsProfile = 'a-search-walrus-sql-drain',
  [string]$AwsRegion = 'eu-west-2',
  [string]$SqsDbBackedUrl,
  [string]$AClubsRoot,
  [ValidateSet('', 'live', 'sandbox')]
  [string]$ASearchEnv = 'live',
  [string]$MssqlServer,
  [string]$MssqlDatabase,
  [string]$MssqlUser,
  [string]$MssqlPasswordFile,
  [string]$ServiceAccount,
  [string]$ServicePasswordFile,
  [string]$MssqlOdbcDriver = 'ODBC Driver 17 for SQL Server',
  [string]$AwsSharedCredentialsFile,
  [string]$AwsConfigFile,
  [string]$NssmExe,
  [Alias('DryRun')][switch]$WhatIf,
  [switch]$Unregister
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$DryRun = [bool]$WhatIf

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

function Resolve-NodePath {
  param([string]$NodeExe)
  if ([System.IO.Path]::IsPathRooted($NodeExe) -and (Test-Path -LiteralPath $NodeExe)) {
    return $NodeExe
  }
  $cmd = Get-Command $NodeExe -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "node.exe not found ($NodeExe)" }
  return $cmd.Source
}

function Read-SecretFile {
  param([string]$Path)
  if (-not $Path) { return $null }
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "secret_file_missing: $Path"
  }
  $raw = [System.IO.File]::ReadAllText($Path).Trim()
  if (-not $raw) { throw "secret_file_empty: $Path" }
  return $raw
}

function Invoke-Nssm {
  # Never name the arg array $Args (PowerShell automatic; always empty).
  param([string]$Nssm, [string[]]$NssmArgs)
  if ($DryRun) {
    $displayArgs = foreach ($a in $NssmArgs) {
      if ($a -match '^(MSSQL_PASSWORD|AWS_SECRET_ACCESS_KEY)=') {
        ($a -replace '=.*$', '=***')
      } else {
        $a
      }
    }
    Write-Host ('[DryRun] nssm ' + ($displayArgs -join ' '))
    return 0
  }
  & $Nssm @NssmArgs | Out-Host
  return [int]$LASTEXITCODE
}

function Build-DrainEnvPairs {
  # nssm AppEnvironmentExtra: KEY=VALUE each as a separate arg (FR #4164 pattern).
  param(
    [string]$AwsProfile,
    [string]$AwsRegion,
    [string]$SqsDbBackedUrl,
    [string]$AClubsRoot,
    [string]$ASearchEnv,
    [string]$MssqlServer,
    [string]$MssqlDatabase,
    [string]$MssqlUser,
    [string]$MssqlPassword,
    [bool]$TrustedConnection,
    [string]$MssqlOdbcDriver,
    [string]$AwsSharedCredentialsFile,
    [string]$AwsConfigFile
  )
  $envPairs = New-Object System.Collections.Generic.List[string]
  [void]$envPairs.Add("AWS_PROFILE=$AwsProfile")
  [void]$envPairs.Add("AWS_REGION=$AwsRegion")
  if ($AwsSharedCredentialsFile) {
    [void]$envPairs.Add("AWS_SHARED_CREDENTIALS_FILE=$AwsSharedCredentialsFile")
  }
  if ($AwsConfigFile) {
    [void]$envPairs.Add("AWS_CONFIG_FILE=$AwsConfigFile")
  }
  [void]$envPairs.Add("SQS_DB_BACKED_URL=$SqsDbBackedUrl")
  [void]$envPairs.Add("A_CLUBS_ROOT=$AClubsRoot")
  if ($ASearchEnv) { [void]$envPairs.Add("A_SEARCH_ENV=$ASearchEnv") }
  [void]$envPairs.Add("MSSQL_SERVER=$MssqlServer")
  [void]$envPairs.Add("MSSQL_DATABASE=$MssqlDatabase")
  if ($TrustedConnection) {
    [void]$envPairs.Add('MSSQL_TRUSTED_CONNECTION=true')
    # FR #4548: pin ODBC 17 so msnodesqlv8 does not pick Native Client 11.0.
    $odbc = if ($MssqlOdbcDriver -and $MssqlOdbcDriver.Trim()) {
      $MssqlOdbcDriver.Trim()
    } else {
      'ODBC Driver 17 for SQL Server'
    }
    [void]$envPairs.Add("MSSQL_ODBC_DRIVER=$odbc")
  } else {
    [void]$envPairs.Add("MSSQL_USER=$MssqlUser")
    [void]$envPairs.Add("MSSQL_PASSWORD=$MssqlPassword")
  }
  return ,$envPairs.ToArray()
}

function Format-EnvPairsForDisplay {
  param([string[]]$EnvPairs)
  $lines = foreach ($p in $EnvPairs) {
    if ($p -match '^(MSSQL_PASSWORD|AWS_SECRET_ACCESS_KEY)=') {
      ($p -replace '=.*$', '=***')
    } else {
      $p
    }
  }
  return ($lines -join "`n") + "`n"
}

$indexJs = Join-Path $InstallRoot 'walrus\src\index.js'
$logDir = Join-Path $InstallRoot 'walrus\logs'
$stdoutLog = Join-Path $logDir 'walrus-sql-drain.out.log'
$stderrLog = Join-Path $logDir 'walrus-sql-drain.err.log'

if (-not $Unregister -and -not $DryRun -and -not (Test-Path -LiteralPath $indexJs)) {
  throw "index.js not found at $indexJs"
}

$nssm = Resolve-NssmPath -NssmExe $NssmExe
$nodePath = Resolve-NodePath -NodeExe $NodeExe
$appParams = '"{0}"' -f $indexJs

if ($Unregister) {
  $null = Invoke-Nssm -Nssm $nssm -NssmArgs @('stop', $ServiceName)
  $code = Invoke-Nssm -Nssm $nssm -NssmArgs @('remove', $ServiceName, 'confirm')
  if ($code -ne 0 -and -not $DryRun) {
    Write-Warning "nssm remove exited $code (service may already be absent)"
  }
  Write-Host "Unregistered $ServiceName"
  return
}

# --- resolve required register params (FR #4511) ---
if (-not $SqsDbBackedUrl) {
  throw 'SqsDbBackedUrl_required: pass -SqsDbBackedUrl <a-search-db-backed queue URL from stack output>'
}
if (-not $AClubsRoot) {
  throw 'AClubsRoot_required: pass -AClubsRoot <mapped a-clubs root, e.g. D:\s3\a-clubs>'
}
if (-not $MssqlServer) {
  throw 'MssqlServer_required: pass -MssqlServer <host\instance, e.g. walrus\ASEARCH>'
}

if (-not $MssqlDatabase) {
  if ($ASearchEnv -eq 'sandbox') { $MssqlDatabase = 'a_search_sandbox' }
  else { $MssqlDatabase = 'a_search' }
}
$dbNorm = $MssqlDatabase.Trim().ToLowerInvariant()
if ($dbNorm -eq 'madeiradb') {
  throw 'madeiradb_read_only: MSSQL_DATABASE must be a_search or a_search_sandbox for the walrus SQL drain'
}
if ($dbNorm -ne 'a_search' -and $dbNorm -ne 'a_search_sandbox') {
  throw "MSSQL_DATABASE_invalid: expected a_search or a_search_sandbox, got $MssqlDatabase"
}

$useTrusted = [bool]$ServiceAccount
$mssqlPassword = $null
if ($useTrusted) {
  if ($MssqlUser -or $MssqlPasswordFile) {
    throw 'auth_conflict: use either -ServiceAccount (trusted) or -MssqlUser/-MssqlPasswordFile (SQL auth), not both'
  }
} else {
  if (-not $MssqlUser) {
    throw 'MssqlUser_required: pass -MssqlUser and -MssqlPasswordFile, or -ServiceAccount for trusted SQL'
  }
  if (-not $MssqlPasswordFile) {
    throw 'MssqlPasswordFile_required: pass -MssqlPasswordFile (password never on the command line)'
  }
  $mssqlPassword = Read-SecretFile -Path $MssqlPasswordFile
}

if ($AwsSharedCredentialsFile -and -not (Test-Path -LiteralPath $AwsSharedCredentialsFile) -and -not $DryRun) {
  throw "AwsSharedCredentialsFile_missing: $AwsSharedCredentialsFile"
}
if ($AwsConfigFile -and -not (Test-Path -LiteralPath $AwsConfigFile) -and -not $DryRun) {
  throw "AwsConfigFile_missing: $AwsConfigFile"
}

$envPairs = Build-DrainEnvPairs `
  -AwsProfile $AwsProfile `
  -AwsRegion $AwsRegion `
  -SqsDbBackedUrl $SqsDbBackedUrl `
  -AClubsRoot $AClubsRoot `
  -ASearchEnv $ASearchEnv `
  -MssqlServer $MssqlServer `
  -MssqlDatabase $MssqlDatabase `
  -MssqlUser $MssqlUser `
  -MssqlPassword $mssqlPassword `
  -TrustedConnection $useTrusted `
  -MssqlOdbcDriver $MssqlOdbcDriver `
  -AwsSharedCredentialsFile $AwsSharedCredentialsFile `
  -AwsConfigFile $AwsConfigFile

if ($DryRun) {
  Write-Host '[DryRun] AppEnvironmentExtra (secrets masked):'
  Write-Host (Format-EnvPairsForDisplay -EnvPairs $envPairs)
}

if (-not $DryRun) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  $code = Invoke-Nssm -Nssm $nssm -NssmArgs @('set', $ServiceName, 'Application', $nodePath)
  if ($code -ne 0) { throw "nssm set Application failed: $code" }
} else {
  $code = Invoke-Nssm -Nssm $nssm -NssmArgs @('install', $ServiceName, $nodePath)
  if ($code -ne 0) { throw "nssm install failed: $code" }
}

$sets = @(
  @('AppParameters', $appParams),
  @('AppDirectory', $InstallRoot),
  @('DisplayName', 'a-search walrus SQL drain'),
  @('Description', 'FR #4447/#4511: long-poll a-search-db-backed over outbound HTTPS; write a-clubs IN/'),
  @('Start', 'SERVICE_AUTO_START'),
  @('AppStdout', $stdoutLog),
  @('AppStderr', $stderrLog),
  @('AppRotateFiles', '1'),
  @('AppRotateBytes', '10485760'),
  @('AppExit', 'Default', 'Restart'),
  @('AppRestartDelay', '5000')
)

foreach ($s in $sets) {
  $code = Invoke-Nssm -Nssm $nssm -NssmArgs (@('set', $ServiceName) + $s)
  if ($code -ne 0) { throw "nssm set $($s[0]) failed: $code" }
}

$code = Invoke-Nssm -Nssm $nssm -NssmArgs (@('set', $ServiceName, 'AppEnvironmentExtra') + $envPairs)
if ($code -ne 0) { throw "nssm set AppEnvironmentExtra failed: $code" }

if ($useTrusted) {
  # FR #4534: ObjectName without password is OK; operator may set password via nssm.
  # Never put the service account password into AppEnvironmentExtra.
  $svcUser = $ServiceAccount
  $svcPass = $null
  if ($ServicePasswordFile) {
    $svcPass = Read-SecretFile -Path $ServicePasswordFile
  }
  if ($DryRun) {
    if ($svcPass) {
      Write-Host "[DryRun] nssm set $ServiceName ObjectName $svcUser ***"
    } else {
      Write-Host "[DryRun] nssm set $ServiceName ObjectName $svcUser (password via nssm interactive / omitted)"
    }
  } else {
    if ($svcPass) {
      $null = & $nssm set $ServiceName ObjectName $svcUser $svcPass 2>&1 | Out-Null
    } else {
      $null = & $nssm set $ServiceName ObjectName $svcUser 2>&1 | Out-Null
    }
    $code = [int]$LASTEXITCODE
    if ($code -ne 0) { throw "nssm ObjectName failed: $code" }
  }
}

if (-not $DryRun) {
  Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
}

Write-Host "Registered $ServiceName -> $nodePath $appParams (InstallRoot=$InstallRoot)"
