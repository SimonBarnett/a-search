#Requires -Version 5.1
<#
.SYNOPSIS
  Register the walrus SQL SQS drain as a Windows service via nssm (FR #4447).

.DESCRIPTION
  Idempotent: installs/updates service "a-search-walrus-sql-drain" with nssm wrapping
  `node walrus\src\index.js` from InstallRoot (default C:\ai\a-search).
  Auto-start, restart on failure. Outbound HTTPS SQS only --- no inbound port.
  Logs to InstallRoot\walrus\logs\. Bare sc.exe + node.exe is rejected (error 1053);
  nssm is required. Compatible with Windows PowerShell 5.1.

.PARAMETER InstallRoot
  Stable install folder containing walrus\src\index.js.

.PARAMETER ServiceName
  Windows service name (default a-search-walrus-sql-drain).

.PARAMETER NodeExe
  Path to node.exe.

.PARAMETER AwsProfile
  Named AWS profile for outbound SQS (default a-search-walrus-sql-drain).

.PARAMETER AClubsRoot
  Mapped a-clubs root (sets A_CLUBS_ROOT). Optional when already in the machine env.

.PARAMETER ASearchEnv
  live|sandbox (sets A_SEARCH_ENV).

.PARAMETER MssqlDatabase
  a_search or a_search_sandbox (sets MSSQL_DATABASE). Never madeiradb for writers.

.PARAMETER NssmExe
  Path to nssm.exe (default: C:\ai\bob\third_party\nssm\win64\nssm.exe or PATH).

.PARAMETER WhatIf
  Alias DryRun: print nssm commands only; do not change the machine.

.PARAMETER Unregister
  Remove the service via nssm.
#>
[CmdletBinding(SupportsShouldProcess = $false)]
param(
  [string]$InstallRoot = 'C:\ai\a-search',
  [string]$ServiceName = 'a-search-walrus-sql-drain',
  [string]$NodeExe = 'node',
  [string]$AwsProfile = 'a-search-walrus-sql-drain',
  [string]$AClubsRoot,
  [ValidateSet('', 'live', 'sandbox')]
  [string]$ASearchEnv = '',
  [string]$MssqlDatabase,
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

function Invoke-Nssm {
  # Never name the arg array $Args (PowerShell automatic; always empty).
  param([string]$Nssm, [string[]]$NssmArgs)
  $line = 'nssm ' + ($NssmArgs -join ' ')
  if ($DryRun) {
    Write-Host "[DryRun] $line"
    return 0
  }
  & $Nssm @NssmArgs | Out-Host
  return [int]$LASTEXITCODE
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
  @('Description', 'FR #4447: long-poll a-search-db-backed over outbound HTTPS; write a-clubs IN/'),
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

# AppEnvironmentExtra: AWS_PROFILE + optional A_CLUBS_ROOT / A_SEARCH_ENV / MSSQL_DATABASE
$envLines = New-Object System.Collections.Generic.List[string]
[void]$envLines.Add("AWS_PROFILE=$AwsProfile")
if ($AClubsRoot) { [void]$envLines.Add("A_CLUBS_ROOT=$AClubsRoot") }
if ($ASearchEnv) { [void]$envLines.Add("A_SEARCH_ENV=$ASearchEnv") }
if ($MssqlDatabase) {
  $db = $MssqlDatabase.Trim().ToLowerInvariant()
  if ($db -eq 'madeiradb') {
    throw 'madeiradb_read_only: MSSQL_DATABASE must be a_search or a_search_sandbox for the walrus SQL drain'
  }
  [void]$envLines.Add("MSSQL_DATABASE=$MssqlDatabase")
}
$envExtra = ($envLines -join "`n") + "`n"
$code = Invoke-Nssm -Nssm $nssm -NssmArgs @('set', $ServiceName, 'AppEnvironmentExtra', $envExtra)
if ($code -ne 0) { throw "nssm set AppEnvironmentExtra failed: $code" }

if (-not $DryRun) {
  Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
}

Write-Host "Registered $ServiceName -> $nodePath $appParams (InstallRoot=$InstallRoot)"
