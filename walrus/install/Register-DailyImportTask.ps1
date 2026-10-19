#Requires -Version 5.1
<#
.SYNOPSIS
  Register the FR #4463 daily parts-import Scheduled Task on walrus.

.DESCRIPTION
  Creates/updates task "a-search-daily-import" to run daily at 04:00
  Europe/London (local clock). MultipleInstances = IgnoreNew.
  Uses a dedicated service account when -RunAsUser is supplied.

  Lock file: %ProgramData%\a-search\import.lock
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$NodeExe = 'node',
  [string]$TaskName = 'a-search-daily-import',
  [string]$DailyAt = '04:00',
  [string]$RunAsUser = '',
  [switch]$Unregister
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$cli = Join-Path $RepoRoot 'walrus\import\cli.js'
if (-not (Test-Path -LiteralPath $cli)) {
  throw "cli.js not found at $cli"
}

if ($Unregister) {
  if ($PSCmdlet.ShouldProcess($TaskName, 'Unregister-ScheduledTask')) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  }
  Write-Host "Unregistered $TaskName"
  return
}

$dataDir = Join-Path $env:ProgramData 'a-search'
if ($PSCmdlet.ShouldProcess($dataDir, 'Ensure data directory')) {
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
}
$log = Join-Path $dataDir 'daily-import.log'
$lock = Join-Path $dataDir 'import.lock'

$arg = "`"$cli`" run"
$action = New-ScheduledTaskAction -Execute $NodeExe -Argument $arg -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $DailyAt
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 4) `
  -MultipleInstances IgnoreNew

$principalParams = @{
  LogonType = 'Interactive'
  RunLevel  = 'Limited'
}
if ($RunAsUser) {
  $principalParams.UserId = $RunAsUser
  $principalParams.LogonType = 'Password'
}
$principal = New-ScheduledTaskPrincipal @principalParams

Write-Host "TaskName=$TaskName"
Write-Host "DailyAt=$DailyAt"
Write-Host "MultipleInstances=IgnoreNew"
Write-Host "Cli=$cli"
Write-Host "Log=$log"
Write-Host "Lock=$lock"

if ($WhatIfPreference) {
  Write-Host "WhatIf: would Register-ScheduledTask $TaskName daily at $DailyAt MultipleInstances IgnoreNew"
  return
}

if ($PSCmdlet.ShouldProcess($TaskName, 'Register-ScheduledTask')) {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Write-Host "Registered $TaskName daily at $DailyAt"
}
