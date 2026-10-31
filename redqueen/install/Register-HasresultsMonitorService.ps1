#Requires -Version 5.1
<#
.SYNOPSIS
  Register a-hasresults-monitor as a Windows service on redqueen (FR #4918).

.DESCRIPTION
  Idempotent nssm installer for dist\sea\a-hasresults-monitor.exe.
  SERVICE_AUTO_START, restart on failure, rotating logs under InstallRoot\logs.
  Runs on redqueen (Simon 2026-10-25). FR #5305: defaults AWS_SHARED_CREDENTIALS_FILE
  and AWS_CONFIG_FILE to Administrator .aws paths (or process env) so LocalSystem
  can load the same shared credentials as a-search-aclubs-queue. Missing AWS
  credentials: the service warns and keeps polling (no crash). Never prints secrets.

.PARAMETER InstallRoot
  Folder that contains dist\sea\a-hasresults-monitor.exe.

.PARAMETER ExePath
  Override path to a-hasresults-monitor.exe.

.PARAMETER AClubsRoot
  Optional mapped a-clubs root for agent cwd (A_CLUBS_ROOT).

.PARAMETER AClubsBucket
  Default a-clubs.

.PARAMETER AwsProfile
  Named profile (default a-search-redqueen-annotator).

.PARAMETER AwsRegion
  Default eu-west-2.

.PARAMETER AwsSharedCredentialsFile
  Path for AWS_SHARED_CREDENTIALS_FILE. Empty: process env, else
  {SystemDrive}\Users\Administrator\.aws\credentials (FR #5305).

.PARAMETER AwsConfigFile
  Path for AWS_CONFIG_FILE. Empty: process env, else
  {SystemDrive}\Users\Administrator\.aws\config (FR #5305).

.PARAMETER IntervalMs
  HASRESULTS_MONITOR_MS (default 900000).

.PARAMETER WhatIf
  Print nssm commands; do not change the machine.

.PARAMETER Unregister
  Stop and remove a-hasresults-monitor.
#>
[CmdletBinding(SupportsShouldProcess = $false)]
param(
  [string]$InstallRoot = 'C:\ai\a-search',
  [string]$ExePath,
  [string]$NssmExe,
  [string]$AwsProfile = 'a-search-redqueen-annotator',
  [string]$AwsRegion = 'eu-west-2',
  [string]$AClubsBucket = 'a-clubs',
  [string]$AClubsRoot,
  [string]$AwsSharedCredentialsFile,
  [string]$AwsConfigFile,
  [string]$IntervalMs = '900000',
  [string]$MaxRetries = '5',
  [string]$GrokBin,
  [Alias('DryRun')][switch]$WhatIf,
  [switch]$Unregister
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$DryRun = [bool]$WhatIf
$ServiceName = 'a-hasresults-monitor'
if (-not $ExePath) {
  $ExePath = Join-Path $InstallRoot 'dist\sea\a-hasresults-monitor.exe'
}

function Resolve-NssmPath {
  param([string]$NssmExe)
  if ($NssmExe -and (Test-Path -LiteralPath $NssmExe)) {
    return (Resolve-Path -LiteralPath $NssmExe).Path
  }
  $default = 'C:\ai\bob\third_party\nssm\win64\nssm.exe'
  if (Test-Path -LiteralPath $default) { return $default }
  $cmd = Get-Command nssm -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw 'nssm_required: install nssm or pass -NssmExe'
}

function Invoke-Nssm {
  param([string]$Nssm, [string[]]$NssmArgs)
  if ($DryRun) {
    Write-Host ('[DryRun] nssm ' + ($NssmArgs -join ' '))
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
    Write-Warning "nssm remove $Name exited $code"
  }
  Write-Host "Unregistered $Name"
}

$nssm = Resolve-NssmPath -NssmExe $NssmExe

if ($Unregister) {
  Remove-NssmService -Nssm $nssm -Name $ServiceName
  return
}

if (-not $DryRun) {
  if (-not (Test-Path -LiteralPath $ExePath)) {
    throw "hasresults_monitor_exe_missing: $ExePath"
  }
}

$logDir = Join-Path $InstallRoot 'logs'
if (-not $DryRun) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}

$envPairs = New-Object System.Collections.Generic.List[string]
[void]$envPairs.Add("AWS_PROFILE=$AwsProfile")
[void]$envPairs.Add("AWS_REGION=$AwsRegion")
[void]$envPairs.Add("A_CLUBS_BUCKET=$AClubsBucket")
[void]$envPairs.Add("HASRESULTS_MONITOR_MS=$IntervalMs")
[void]$envPairs.Add("HASRESULTS_MONITOR_MAX_RETRIES=$MaxRetries")
if ($AClubsRoot) { [void]$envPairs.Add("A_CLUBS_ROOT=$AClubsRoot") }
# FR #5305: always set shared credential file paths for LocalSystem (param > process env > Administrator .aws).
if (-not $AwsSharedCredentialsFile) {
  if ($env:AWS_SHARED_CREDENTIALS_FILE) {
    $AwsSharedCredentialsFile = $env:AWS_SHARED_CREDENTIALS_FILE
  } else {
    $AwsSharedCredentialsFile = Join-Path $env:SystemDrive 'Users\Administrator\.aws\credentials'
  }
}
if (-not $AwsConfigFile) {
  if ($env:AWS_CONFIG_FILE) {
    $AwsConfigFile = $env:AWS_CONFIG_FILE
  } else {
    $AwsConfigFile = Join-Path $env:SystemDrive 'Users\Administrator\.aws\config'
  }
}
[void]$envPairs.Add("AWS_SHARED_CREDENTIALS_FILE=$AwsSharedCredentialsFile")
[void]$envPairs.Add("AWS_CONFIG_FILE=$AwsConfigFile")
if ($GrokBin) { [void]$envPairs.Add("A_SEARCH_GROK_BIN=$GrokBin") }
[void]$envPairs.Add("HASRESULTS_MONITOR_LOG_FILE=$(Join-Path $logDir 'a-hasresults-monitor.log')")

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  $code = Invoke-Nssm -Nssm $nssm -NssmArgs @('set', $ServiceName, 'Application', $ExePath)
  if ($code -ne 0) { throw "nssm set Application failed: $code" }
} else {
  $code = Invoke-Nssm -Nssm $nssm -NssmArgs @('install', $ServiceName, $ExePath)
  if ($code -ne 0) { throw "nssm install failed: $code" }
}

$sets = @(
  @('AppDirectory', $InstallRoot),
  @('DisplayName', 'a-search hasresults monitor (FR #4918)'),
  @('Description', 'Deterministic redqueen monitor: hasresults=1 GUID cwd agent then clear hasresults'),
  @('Start', 'SERVICE_AUTO_START'),
  @('AppStdout', (Join-Path $logDir 'a-hasresults-monitor.out.log')),
  @('AppStderr', (Join-Path $logDir 'a-hasresults-monitor.err.log')),
  @('AppRotateFiles', '1'),
  @('AppRotateBytes', '10485760'),
  @('AppExit', 'Default', 'Restart'),
  @('AppRestartDelay', '5000')
)
foreach ($s in $sets) {
  $code = Invoke-Nssm -Nssm $nssm -NssmArgs (@('set', $ServiceName) + $s)
  if ($code -ne 0) { throw "nssm set $($s[0]) failed: $code" }
}
$code = Invoke-Nssm -Nssm $nssm -NssmArgs (@('set', $ServiceName, 'AppEnvironmentExtra') + $envPairs.ToArray())
if ($code -ne 0) { throw "nssm set AppEnvironmentExtra failed: $code" }
if (-not $DryRun) {
  Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
}
Write-Host "Registered $ServiceName -> $ExePath"
