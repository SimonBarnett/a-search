#Requires -Version 5.1
<#
.SYNOPSIS
  Register a daily Scheduled Task for the FR #4123 Awin onboarding agent.

.DESCRIPTION
  Idempotent. Runs `node redqueen\awin-agent\src\run.js` from InstallRoot once
  per day. Does not store Awin passwords in the task XML — the process reads
  C:\passwords\awin.secret.txt at runtime.
#>
[CmdletBinding()]
param(
  [string]$InstallRoot = 'C:\ai\a-search',
  [string]$TaskName = 'a-search-awin-agent',
  [string]$NodeExe = 'node',
  [string]$Time = '06:30',
  [switch]$Unregister
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$runJs = Join-Path $InstallRoot 'redqueen\awin-agent\src\run.js'
if (-not $Unregister -and -not (Test-Path -LiteralPath $runJs)) {
  throw "run.js not found at $runJs"
}

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Unregistered $TaskName"
  return
}

$nodePath = $NodeExe
if (-not [System.IO.Path]::IsPathRooted($nodePath)) {
  $cmd = Get-Command $NodeExe -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "node.exe not found ($NodeExe)" }
  $nodePath = $cmd.Source
}

$arg = '"{0}"' -f $runJs
$action = New-ScheduledTaskAction -Execute $nodePath -Argument $arg -WorkingDirectory $InstallRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Registered $TaskName daily at $Time"
Write-Host "DryRun: & '$nodePath' '$runJs' -DryRun"
