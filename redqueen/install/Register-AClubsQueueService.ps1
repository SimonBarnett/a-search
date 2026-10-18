#Requires -Version 5.1
<#
.SYNOPSIS
  Register the FR #4098 redqueen a-clubs queue drain as a Windows service.

.DESCRIPTION
  Idempotent: creates or updates service "a-search-aclubs-queue" to run
  `node redqueen\src\run.js` from InstallRoot (default C:\ai\a-search).
  Auto-start, restart on failure. Sets AWS_PROFILE=a-search-redqueen-annotator.
  Logs to %ProgramData%\a-search\aclubs-queue.log (no secrets).
  Compatible with Windows PowerShell 5.1.

.PARAMETER InstallRoot
  Stable install folder containing redqueen\src\run.js.

.PARAMETER ServiceName
  Windows service name.

.PARAMETER NodeExe
  Path to node.exe.

.PARAMETER Unregister
  Remove the service instead.
#>
[CmdletBinding()]
param(
  [string]$InstallRoot = 'C:\ai\a-search',
  [string]$ServiceName = 'a-search-aclubs-queue',
  [string]$NodeExe = 'node',
  [string]$AwsProfile = 'a-search-redqueen-annotator',
  [switch]$Unregister
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$runJs = Join-Path $InstallRoot 'redqueen\src\run.js'
if (-not $Unregister -and -not (Test-Path -LiteralPath $runJs)) {
  throw "run.js not found at $runJs"
}

$dataDir = Join-Path $env:ProgramData 'a-search'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$logFile = Join-Path $dataDir 'aclubs-queue.log'

if ($Unregister) {
  $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($existing) {
    if ($existing.Status -eq 'Running') {
      Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    }
    & sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
    Write-Host "Unregistered $ServiceName"
  }
  else {
    Write-Host "Service $ServiceName not present"
  }
  return
}

# Resolve node.exe
$nodePath = $NodeExe
if (-not [System.IO.Path]::IsPathRooted($nodePath)) {
  $cmd = Get-Command $NodeExe -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "node.exe not found ($NodeExe)" }
  $nodePath = $cmd.Source
}

# binPath: node run.js — env via registry AppEnvironment / wrapper
$binPath = '"{0}" "{1}"' -f $nodePath, $runJs

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  & sc.exe stop $ServiceName | Out-Null
  Start-Sleep -Seconds 1
  & sc.exe config $ServiceName binPath= $binPath start= auto | Out-Null
  Write-Host "Updated $ServiceName binPath"
}
else {
  & sc.exe create $ServiceName binPath= $binPath start= auto DisplayName= "a-search a-clubs queue (redqueen)" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "sc.exe create failed with $LASTEXITCODE"
  }
  Write-Host "Created $ServiceName"
}

# Restart on failure: reset 86400s, restart after 5s/30s/60s
& sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/30000/restart/60000 | Out-Null
& sc.exe failureflag $ServiceName 1 | Out-Null

# Persist env for the service (Win10+): AWS_PROFILE, queue URL from machine env, log path
# Operators set A_CLUBS_FOLDER_EVENTS_QUEUE_URL at machine scope before start.
$envReg = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
if (Test-Path $envReg) {
  $envLines = @(
    "AWS_PROFILE=$AwsProfile",
    "AWS_REGION=eu-west-2",
    "A_CLUBS_BUCKET=a-clubs",
    "REDQUEEN_LOG_FILE=$logFile",
    "REDQUEEN_POLL_MS=5000"
  )
  # Preserve machine-level queue URL if already set in process for install convenience
  if ($env:A_CLUBS_FOLDER_EVENTS_QUEUE_URL) {
    $envLines += "A_CLUBS_FOLDER_EVENTS_QUEUE_URL=$($env:A_CLUBS_FOLDER_EVENTS_QUEUE_URL)"
  }
  # REG_MULTI_SZ via sc.exe or registry — use Environment value (Windows service env)
  New-ItemProperty -Path $envReg -Name 'Environment' -PropertyType MultiString -Value $envLines -Force | Out-Null
}

Write-Host "Service: $ServiceName"
Write-Host "InstallRoot: $InstallRoot"
Write-Host "Node: $nodePath"
Write-Host "AWS_PROFILE: $AwsProfile"
Write-Host "Log: $logFile"
Write-Host "Start: Start-Service $ServiceName"
Write-Host "Manual: `$env:AWS_PROFILE='$AwsProfile'; `$env:REDQUEEN_LOG_FILE='$logFile'; & '$nodePath' '$runJs'"
