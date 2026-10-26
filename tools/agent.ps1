#Requires -Version 5.1
<#
.SYNOPSIS
  Provider-aware affiliate agent entry (FR #4123 / #4701).

.DESCRIPTION
  Run from S:\a-affiliates\awin or S:\a-affiliates\rakuten (or -Cwd).
  Prefers Grok agent.exe when present for interactive seats; the scheduled
  Task uses node redqueen/affiliate-agent/src/run.js directly.
  Never prints passwords from C:\passwords\*.secret.txt.

.EXAMPLE
  cd S:\a-affiliates\rakuten
  C:\ai\a-search\tools\agent.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [string]$Cwd = (Get-Location).Path,
  [string]$InstallRoot = 'C:\ai\a-search',
  [switch]$DryRun,
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
. (Join-Path $here 'ToolFailure.ps1')
. (Join-Path $here 'FolderProgress.ps1')

if ($Help) {
  Write-Host @"
tools/agent.ps1 --- affiliate agent (awin | rakuten)

  cd S:\a-affiliates\rakuten
  .\tools\agent.ps1 [-DryRun]

  cd S:\a-affiliates\awin
  .\tools\agent.ps1 [-DryRun]

Providers: awin (FR #4123 invite/join + feeds), rakuten (FR #4701 applications only).
Secrets: C:\passwords\awin.secret.txt | C:\passwords\rakuten.secret.txt --- never printed.
"@
  exit 0
}

$runJs = Join-Path $InstallRoot 'redqueen\affiliate-agent\src\run.js'
if (-not (Test-Path -LiteralPath $runJs)) {
  $msg = "affiliate-agent run.js missing at $runJs"
  Write-Error $msg
  Invoke-ASearchToolFailureReport -Tool 'agent' -ErrorCode 'agent_missing_runjs' -Detail $msg -ExitCode 1 -CommandLine ([string]$MyInvocation.Line)
  exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  $msg = 'node.exe not on PATH'
  Write-Error $msg
  Invoke-ASearchToolFailureReport -Tool 'agent' -ErrorCode 'node_missing' -Detail $msg -ExitCode 1 -CommandLine ([string]$MyInvocation.Line)
  exit 1
}

Write-FolderToolStep ('agent starting cwd={0}' -f $Cwd)
$argList = @($runJs, '-Cwd', $Cwd)
if ($DryRun) { $argList += '-DryRun' }
# FR #5065: scheduled/interactive rakuten agent uses invite backend (no password temp).
$env:RAKUTEN_USE_INVITE = '1'

# Interactive fuel hint: Grok agent.exe first (ops), then this node runner.
$grokAgent = Join-Path $env:USERPROFILE '.grok\bin\agent.exe'
if (Test-Path -LiteralPath $grokAgent) {
  Write-Host "INFO fuel: grok agent.exe present at $grokAgent (scheduled task still uses node)"
}

& $node.Source @argList
exit $LASTEXITCODE
