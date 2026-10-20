#Requires -Version 5.1
<#
.SYNOPSIS
  Register a daily Scheduled Task for the affiliate agent (Awin or Rakuten).

.DESCRIPTION
  FR #4701 / #4123. Idempotent. Does not alter the other provider's task.
  Awin keeps TaskName a-search-awin-agent; Rakuten uses a-search-rakuten-agent.
  Action runs node affiliate-agent entry with -Cwd pointing at the provider folder
  under the a-affiliates mount (default S:\a-affiliates\{provider}).
#>
[CmdletBinding()]
param(
  [ValidateSet('awin', 'rakuten')]
  [string]$Provider = 'rakuten',
  [string]$InstallRoot = 'C:\ai\a-search',
  [string]$AffiliatesRoot = 'S:\a-affiliates',
  [string]$NodeExe = 'node',
  [string]$Time = '06:30',
  [switch]$Unregister,
  [switch]$WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$taskName = if ($Provider -eq 'awin') { 'a-search-awin-agent' } else { 'a-search-rakuten-agent' }
$runJs = Join-Path $InstallRoot 'redqueen\affiliate-agent\src\run.js'
$providerCwd = Join-Path $AffiliatesRoot $Provider

if ($Unregister) {
  if ($WhatIf) {
    Write-Host "WhatIf: would unregister $taskName"
    return
  }
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Unregistered $taskName"
  return
}

if (-not (Test-Path -LiteralPath $runJs)) {
  throw "run.js not found at $runJs"
}

$nodePath = $NodeExe
if (-not [System.IO.Path]::IsPathRooted($nodePath)) {
  $cmd = Get-Command $NodeExe -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "node.exe not found ($NodeExe)" }
  $nodePath = $cmd.Source
}

$arg = '"{0}" -Cwd "{1}"' -f $runJs, $providerCwd
if ($WhatIf) {
  Write-Host "WhatIf: would register $taskName daily at $Time"
  Write-Host "WhatIf: $nodePath $arg (WorkingDirectory=$InstallRoot)"
  Write-Host "WhatIf: leaves other provider task untouched"
  return
}

$action = New-ScheduledTaskAction -Execute $nodePath -Argument $arg -WorkingDirectory $InstallRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Registered $taskName daily at $Time (provider=$Provider)"
Write-Host "DryRun: & '$nodePath' '$runJs' -DryRun -Cwd '$providerCwd'"
