#Requires -Version 5.1
<#
.SYNOPSIS
  Register the redqueen a-clubs queue drain as a Windows service via nssm (FR #4147).

.DESCRIPTION
  Idempotent: installs/updates service "a-search-aclubs-queue" with nssm wrapping
  `node redqueen\src\run.js` from InstallRoot (default C:\ai\a-search).
  Auto-start, restart on failure. Sets AWS_PROFILE=a-search-redqueen-annotator and
  optional GROK_CLI / AGENT_CLI paths. Logs to InstallRoot\redqueen\logs\ (stdout/stderr).
  Bare `sc.exe` + node.exe is rejected (error 1053) --- nssm is required.
  Compatible with Windows PowerShell 5.1.

.PARAMETER InstallRoot
  Stable install folder containing redqueen\src\run.js.

.PARAMETER ServiceName
  Windows service name.

.PARAMETER NodeExe
  Path to node.exe.

.PARAMETER AwsProfile
  Named AWS profile (default a-search-redqueen-annotator). Never printed as secret values.

.PARAMETER NssmExe
  Path to nssm.exe (default: C:\ai\bob\third_party\nssm\win64\nssm.exe or PATH).

.PARAMETER GrokCli
  Optional absolute path to grok.exe (sets GROK_CLI / A_SEARCH_GROK_BIN).

.PARAMETER AgentCli
  Optional absolute path to Cursor agent.cmd/exe (sets AGENT_CLI / A_SEARCH_CURSOR_BIN).

.PARAMETER Credential
  Optional PSCredential for the service logon account. Default: leave as LocalSystem
  but inject AWS_PROFILE + AWS_SHARED_CREDENTIALS_FILE for the annotator profile under
  the installing user's .aws (documented). Prefer running as the admin that owns the profile.

.PARAMETER WhatIf
  Alias DryRun: print nssm commands only; do not change the machine.

.PARAMETER Unregister
  Remove the service via nssm.
#>
[CmdletBinding(SupportsShouldProcess = $false)]
param(
  [string]$InstallRoot = 'C:\ai\a-search',
  [string]$ServiceName = 'a-search-aclubs-queue',
  [string]$NodeExe = 'node',
  [string]$AwsProfile = 'a-search-redqueen-annotator',
  [string]$NssmExe,
  [string]$GrokCli,
  [string]$AgentCli,
  [System.Management.Automation.PSCredential]$Credential,
  [Alias('DryRun')][switch]$WhatIf,
  [switch]$Unregister
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$DryRun = [bool]$WhatIf

function Resolve-NssmPath {
  param([string]$NssmExe)
  if ($NssmExe -and (Test-Path -LiteralPath $NssmExe)) { return (Resolve-Path -LiteralPath $NssmExe).Path }
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
  param([string]$Nssm, [string[]]$Args)
  $line = 'nssm ' + ($Args -join ' ')
  if ($DryRun) {
    Write-Host "[DryRun] $line"
    return 0
  }
  & $Nssm @Args
  return $LASTEXITCODE
}

$runJs = Join-Path $InstallRoot 'redqueen\src\run.js'
$logDir = Join-Path $InstallRoot 'redqueen\logs'
$stdoutLog = Join-Path $logDir 'aclubs-queue.out.log'
$stderrLog = Join-Path $logDir 'aclubs-queue.err.log'

if (-not $Unregister -and -not $DryRun -and -not (Test-Path -LiteralPath $runJs)) {
  throw "run.js not found at $runJs"
}

$nssm = Resolve-NssmPath -NssmExe $NssmExe
$nodePath = Resolve-NodePath -NodeExe $NodeExe
$appParams = '"{0}"' -f $runJs

if (-not $DryRun) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}

if ($Unregister) {
  $null = Invoke-Nssm -Nssm $nssm -Args @('stop', $ServiceName)
  $code = Invoke-Nssm -Nssm $nssm -Args @('remove', $ServiceName, 'confirm')
  if (-not $DryRun -and $code -ne 0) {
    # Fall back: service may already be gone
    Write-Host "nssm remove exit $code (ok if already absent)"
  }
  else {
    Write-Host "Unregistered $ServiceName"
  }
  return
}

# Install or update application
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $existing) {
  $code = Invoke-Nssm -Nssm $nssm -Args @('install', $ServiceName, $nodePath)
  if (-not $DryRun -and $code -ne 0) { throw "nssm install failed: $code" }
}
else {
  if (-not $DryRun -and $existing.Status -eq 'Running') {
    $null = Invoke-Nssm -Nssm $nssm -Args @('stop', $ServiceName)
    Start-Sleep -Seconds 1
  }
}

$set = {
  param([string[]]$a)
  $c = Invoke-Nssm -Nssm $nssm -Args $a
  if (-not $DryRun -and $c -ne 0) { throw ("nssm set failed ({0}): {1}" -f $c, ($a -join ' ')) }
}

& $set @('set', $ServiceName, 'Application', $nodePath)
& $set @('set', $ServiceName, 'AppDirectory', $InstallRoot)
& $set @('set', $ServiceName, 'AppParameters', $appParams)
& $set @('set', $ServiceName, 'DisplayName', 'a-search a-clubs queue (redqueen)')
& $set @('set', $ServiceName, 'Start', 'SERVICE_AUTO_START')
& $set @('set', $ServiceName, 'AppStdout', $stdoutLog)
& $set @('set', $ServiceName, 'AppStderr', $stderrLog)
& $set @('set', $ServiceName, 'AppRotateFiles', '1')
& $set @('set', $ServiceName, 'AppRotateBytes', '5000000')
& $set @('set', $ServiceName, 'AppExit', 'Default', 'Restart')
& $set @('set', $ServiceName, 'AppRestartDelay', '5000')

# Environment: never print secret file contents
$envPairs = @(
  "AWS_PROFILE=$AwsProfile",
  'AWS_REGION=eu-west-2',
  'A_CLUBS_BUCKET=a-clubs',
  "REDQUEEN_LOG_FILE=$stdoutLog",
  'REDQUEEN_POLL_MS=5000'
)
if ($env:A_CLUBS_FOLDER_EVENTS_QUEUE_URL) {
  $envPairs += "A_CLUBS_FOLDER_EVENTS_QUEUE_URL=$($env:A_CLUBS_FOLDER_EVENTS_QUEUE_URL)"
}
# Point AWS SDK at the installing user's shared credentials when running as LocalSystem
# is avoided — prefer -Credential. Still set PROFILE name; operators may also set
# AWS_SHARED_CREDENTIALS_FILE / AWS_CONFIG_FILE at machine scope.
if ($env:AWS_SHARED_CREDENTIALS_FILE) {
  $envPairs += "AWS_SHARED_CREDENTIALS_FILE=$($env:AWS_SHARED_CREDENTIALS_FILE)"
}
if ($env:AWS_CONFIG_FILE) {
  $envPairs += "AWS_CONFIG_FILE=$($env:AWS_CONFIG_FILE)"
}
if ($GrokCli) {
  $envPairs += "GROK_CLI=$GrokCli"
  $envPairs += "A_SEARCH_GROK_BIN=$GrokCli"
}
if ($AgentCli) {
  $envPairs += "AGENT_CLI=$AgentCli"
  $envPairs += "A_SEARCH_CURSOR_BIN=$AgentCli"
}
# nssm AppEnvironmentExtra: KEY=VALUE each as separate arg after the keyword
$envArgs = @('set', $ServiceName, 'AppEnvironmentExtra') + $envPairs
& $set $envArgs

if ($Credential) {
  $user = $Credential.UserName
  if ($DryRun) {
    Write-Host "[DryRun] nssm set $ServiceName ObjectName $user ***"
  }
  else {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Credential.Password)
    try {
      $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
      $code = & $nssm set $ServiceName ObjectName $user $plain
      if ($code -ne 0) { throw "nssm ObjectName failed: $code" }
    }
    finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }
}

Write-Host "Service: $ServiceName"
Write-Host "InstallRoot: $InstallRoot"
Write-Host "Node: $nodePath"
Write-Host "Nssm: $nssm"
Write-Host "AWS_PROFILE: $AwsProfile"
Write-Host "Logs: $logDir"
Write-Host "Start: Start-Service $ServiceName  (or: nssm start $ServiceName)"
if ($DryRun) {
  Write-Host "DryRun complete --- no service changes applied"
}
