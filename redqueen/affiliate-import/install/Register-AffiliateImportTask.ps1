#Requires -Version 5.1
<#
.SYNOPSIS
  Register the FR #4001 daily affiliate-import Scheduled Task on redqueen.

.DESCRIPTION
  Creates/updates task "a-search-affiliate-import" to run daily at 03:30
  Europe/London (local clock). Uses a dedicated service account when
  -RunAsUser is supplied; otherwise the installing user.

  The task and the fixing agent share lock file:
    %ProgramData%\a-search\affiliate-import.lock
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path,
  [string]$NodeExe = 'node',
  [string]$TaskName = 'a-search-affiliate-import',
  [string]$DailyAt = '03:30',
  [string]$RunAsUser = '',
  [switch]$Unregister
)

$ErrorActionPreference = 'Stop'
$cli = Join-Path $RepoRoot 'redqueen\affiliate-import\src\cli.js'
if (-not (Test-Path -LiteralPath $cli)) {
  throw "cli.js not found at $cli"
}

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Unregistered $TaskName"
  return
}

$dataDir = Join-Path $env:ProgramData 'a-search'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$log = Join-Path $dataDir 'affiliate-import.log'
$lock = Join-Path $dataDir 'affiliate-import.lock'

$arg = "`"$cli`""
$action = New-ScheduledTaskAction -Execute $NodeExe -Argument $arg -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $DailyAt
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries

$principalParams = @{
  LogonType = 'Interactive'
  RunLevel  = 'Limited'
}
if ($RunAsUser) {
  $principalParams.UserId = $RunAsUser
  $principalParams.LogonType = 'Password'
}
$principal = New-ScheduledTaskPrincipal @principalParams

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Registered $TaskName daily at $DailyAt"
Write-Host "Log: $log"
Write-Host "Lock: $lock"
Write-Host "Manual: $NodeExe $cli"
