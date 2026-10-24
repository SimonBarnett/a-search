#Requires -Version 5.1
<#
.SYNOPSIS
  Register the redqueen a-clubs queue drain as a Windows service via nssm (FR #4147 / #4164 / #4231 / #4240).

  FR #4827: the replacement service name is a-annotator (exe a-annotator.exe), installed
  together with a-sqlsearch by walrus\install\Register-ASearchWalrusServices.ps1.
  This script remains for the legacy service name a-search-aclubs-queue (node redqueen\src\run.js).

.DESCRIPTION
  Idempotent: installs/updates service "a-search-aclubs-queue" with nssm wrapping
  `node redqueen\src\run.js` from InstallRoot (default C:\ai\a-search).
  Auto-start, restart on failure. Sets AWS_PROFILE=a-search-redqueen-annotator and
  optional GROK_CLI / AGENT_CLI paths. Logs to InstallRoot\redqueen\logs\ (stdout/stderr).
  Bare `sc.exe` + node.exe is rejected (error 1053) --- nssm is required.
  Compatible with Windows PowerShell 5.1.

  FR #4240 / #4231: LocalSystem can run grok reviewers when GROK_HOME is a
  dedicated folder ACL'd to SYSTEM + Administrators (inheritance removed). Pointing
  USERPROFILE/HOME at the Administrator profile fails with Access is denied (os
  error 5) on auth.json --- not because grok ignores GROK_HOME. Preferred reviewer
  mode: -GrokHome (alias -ServiceHome) under LocalSystem. Alternative: -Credential
  / service.password so ObjectName is that admin. -AllowLocalSystem remains for
  tests / AWS-only drains without grok.

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
  Prefer the real cursor-agent CLI (e.g. ...\cursor-agent\agent.cmd), not .grok\bin\agent.exe.

.PARAMETER UserProfile
  Optional path injected as USERPROFILE in AppEnvironmentExtra. When -GrokHome is
  set, defaults to that path.

.PARAMETER HomePath
  Optional path injected as HOME in AppEnvironmentExtra. When -GrokHome is set,
  defaults to that path.

.PARAMETER GrokHome
  Service home root for LocalSystem grok reviewers (FR #4240). Creates the folder
  and .grok with SYSTEM + Administrators-only ACL, sets USERPROFILE/HOME to this
  path and GROK_HOME to <path>\.grok. Alias: -ServiceHome.

.PARAMETER Credential
  Optional PSCredential for the service logon account (nssm ObjectName). Alternative
  to -GrokHome for grok reviewers. Also satisfied by -ServicePasswordFile /
  default service.password.

.PARAMETER ServiceUser
  Account for ObjectName when loading a password file (default .\Administrator).

.PARAMETER ServicePasswordFile
  UTF-8 file containing only the service account password (never commit). Also
  searched at InstallRoot\redqueen\config\service.password and
  InstallRoot\config\service.password, or env A_SEARCH_ACLUBS_SERVICE_PASSWORD_FILE.

.PARAMETER AllowLocalSystem
  Permit LocalSystem when -GrokCli is set without -GrokHome or -Credential
  (tests / AWS-only drains). Default: off. Preferred reviewer LocalSystem mode is -GrokHome.

.PARAMETER SearchApiUrl
  A_SEARCH_API_URL for the service (FR #4311). Else the process env, else the
  text in InstallRoot\redqueen\config\search-api.url. Required unless
  -AllowLocalSystem. Never a secret.

.PARAMETER AgentApiKeyFile
  Path to the agent API key file (A_SEARCH_AGENT_API_KEY_FILE). Default
  InstallRoot\redqueen\config\agent-api.key. The file contents are never logged
  and never placed on the nssm command line. When the file exists, SYSTEM and
  Administrators are granted read.

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
  [string]$UserProfile,
  [string]$HomePath,
  [Alias('ServiceHome')][string]$GrokHome,
  [System.Management.Automation.PSCredential]$Credential,
  [string]$ServiceUser = '.\Administrator',
  [string]$ServicePasswordFile,
  [switch]$AllowLocalSystem,
  [string]$SearchApiUrl,
  [string]$AgentApiKeyFile,
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
  # FR #4164: never name the arg array $Args (PowerShell automatic; always empty).
  # Send nssm stdout/stderr to the host; return only the exit code (scalar).
  param([string]$Nssm, [string[]]$NssmArgs)
  $line = 'nssm ' + ($NssmArgs -join ' ')
  if ($DryRun) {
    Write-Host "[DryRun] $line"
    return 0
  }
  & $Nssm @NssmArgs | Out-Host
  return [int]$LASTEXITCODE
}

function Initialize-GrokHomeAcl {
  param([string]$HomeRoot)
  if (-not $HomeRoot) { throw 'GrokHome path required' }
  $grokDir = Join-Path $HomeRoot '.grok'
  if ($DryRun) {
    Write-Host "[DryRun] ensure GrokHome ACL SYSTEM+Administrators on $HomeRoot and $grokDir"
    return $grokDir
  }
  New-Item -ItemType Directory -Force -Path $HomeRoot | Out-Null
  New-Item -ItemType Directory -Force -Path $grokDir | Out-Null
  $sys = New-Object System.Security.Principal.SecurityIdentifier 'S-1-5-18'
  $admins = New-Object System.Security.Principal.SecurityIdentifier 'S-1-5-32-544'
  $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  $prop = [System.Security.AccessControl.PropagationFlags]::None
  $rights = [System.Security.AccessControl.FileSystemRights]::FullControl
  foreach ($target in @($HomeRoot, $grokDir)) {
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sys, $rights, $inherit, $prop, 'Allow')))
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($admins, $rights, $inherit, $prop, 'Allow')))
    Set-Acl -LiteralPath $target -AclObject $acl
  }
  return $grokDir
}

function Resolve-ReviewerServiceCredential {
  param(
    [System.Management.Automation.PSCredential]$Credential,
    [string]$ServiceUser,
    [string]$ServicePasswordFile,
    [string]$InstallRoot
  )
  if ($Credential) { return $Credential }

  $candidates = New-Object System.Collections.Generic.List[string]
  if ($ServicePasswordFile) { [void]$candidates.Add($ServicePasswordFile) }
  if ($env:A_SEARCH_ACLUBS_SERVICE_PASSWORD_FILE) {
    [void]$candidates.Add($env:A_SEARCH_ACLUBS_SERVICE_PASSWORD_FILE)
  }
  [void]$candidates.Add((Join-Path $InstallRoot 'redqueen\config\service.password'))
  [void]$candidates.Add((Join-Path $InstallRoot 'config\service.password'))

  foreach ($f in $candidates) {
    if (-not $f) { continue }
    if (-not (Test-Path -LiteralPath $f)) { continue }
    # Never Write-Host the password or path contents.
    $raw = [System.IO.File]::ReadAllText($f).Trim()
    if (-not $raw) { continue }
    $sec = ConvertTo-SecureString -String $raw -AsPlainText -Force
    $raw = $null
    $user = if ($ServiceUser) { $ServiceUser } else { '.\Administrator' }
    return New-Object System.Management.Automation.PSCredential ($user, $sec)
  }
  return $null
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

$resolvedCred = Resolve-ReviewerServiceCredential `
  -Credential $Credential `
  -ServiceUser $ServiceUser `
  -ServicePasswordFile $ServicePasswordFile `
  -InstallRoot $InstallRoot

# FR #4240: LocalSystem + GrokCli needs -GrokHome (preferred) or -Credential / AllowLocalSystem.
$resolvedGrokDir = $null
if ($GrokHome) {
  $resolvedGrokDir = Initialize-GrokHomeAcl -HomeRoot $GrokHome
  if (-not $UserProfile) { $UserProfile = $GrokHome }
  if (-not $HomePath) { $HomePath = $GrokHome }
}

if ($GrokCli -and -not $resolvedCred -and -not $GrokHome -and -not $AllowLocalSystem -and -not $Unregister) {
  throw @'
reviewer_logon_required: LocalSystem cannot read Administrator ~/.grok (ACL Access is denied
on auth.json; FR #4240). Pass -GrokHome <dedicated SYSTEM home> (creates SYSTEM+Administrators
ACL and sets USERPROFILE/HOME/GROK_HOME), or -Credential / service.password for an admin
ObjectName, or -AllowLocalSystem for tests / AWS-only drains without reviewers.
'@
}

# FR #4311: always put the search URL and key-file path on the service.
# The key value stays in the file. A registering shell that lacks the env
# vars must still leave searchConfigured true.
$resolvedSearchApiUrl = ''
if ($SearchApiUrl) { $resolvedSearchApiUrl = $SearchApiUrl.Trim() }
elseif ($env:A_SEARCH_API_URL) { $resolvedSearchApiUrl = $env:A_SEARCH_API_URL.Trim() }
else {
  $searchUrlFile = Join-Path $InstallRoot 'redqueen\config\search-api.url'
  if (Test-Path -LiteralPath $searchUrlFile) {
    $resolvedSearchApiUrl = (Get-Content -LiteralPath $searchUrlFile -Raw).Trim()
  }
}
$resolvedAgentKeyFile = ''
if ($AgentApiKeyFile) { $resolvedAgentKeyFile = $AgentApiKeyFile.Trim() }
elseif ($env:A_SEARCH_AGENT_API_KEY_FILE) { $resolvedAgentKeyFile = $env:A_SEARCH_AGENT_API_KEY_FILE.Trim() }
else { $resolvedAgentKeyFile = Join-Path $InstallRoot 'redqueen\config\agent-api.key' }

if (-not $Unregister -and -not $resolvedSearchApiUrl -and -not $AllowLocalSystem) {
  throw @'
search_api_url_required: pass -SearchApiUrl, set A_SEARCH_API_URL, or write
InstallRoot\redqueen\config\search-api.url (FR #4311). -AllowLocalSystem skips
this check for tests.
'@
}

if (-not $Unregister -and $resolvedAgentKeyFile) {
  if (-not (Test-Path -LiteralPath $resolvedAgentKeyFile)) {
    Write-Host 'agent key file missing (path not a secret; contents never logged). Place the key before start.'
  }
  elseif ($DryRun) {
    Write-Host '[DryRun] icacls agent key file SYSTEM:R Administrators:R'
  }
  else {
    & icacls $resolvedAgentKeyFile /inheritance:r /grant:r '*S-1-5-18:R' '*S-1-5-32-544:R' | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "warn: icacls on agent key file returned $LASTEXITCODE"
    }
  }
}

if (-not $Unregister -and $resolvedSearchApiUrl -and ($SearchApiUrl -or $env:A_SEARCH_API_URL) -and -not $DryRun) {
  $searchCfgDir = Join-Path $InstallRoot 'redqueen\config'
  New-Item -ItemType Directory -Force -Path $searchCfgDir | Out-Null
  $searchUrlFile = Join-Path $searchCfgDir 'search-api.url'
  Set-Content -LiteralPath $searchUrlFile -Value $resolvedSearchApiUrl -Encoding ascii
}

if (-not $DryRun) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}

if ($Unregister) {
  $null = Invoke-Nssm -Nssm $nssm -NssmArgs @('stop', $ServiceName)
  $code = Invoke-Nssm -Nssm $nssm -NssmArgs @('remove', $ServiceName, 'confirm')
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
  $code = Invoke-Nssm -Nssm $nssm -NssmArgs @('install', $ServiceName, $nodePath)
  if (-not $DryRun -and $code -ne 0) { throw "nssm install failed: $code" }
}
else {
  if (-not $DryRun -and $existing.Status -eq 'Running') {
    $null = Invoke-Nssm -Nssm $nssm -NssmArgs @('stop', $ServiceName)
    Start-Sleep -Seconds 1
  }
}

$set = {
  param([string[]]$a)
  $c = Invoke-Nssm -Nssm $nssm -NssmArgs $a
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
# FR #4265 / #4311: always pass the API base and a key-file path.
# Never put the key value on the nssm command line.
if ($resolvedSearchApiUrl) {
  $envPairs += "A_SEARCH_API_URL=$resolvedSearchApiUrl"
}
if ($resolvedAgentKeyFile) {
  $envPairs += "A_SEARCH_AGENT_API_KEY_FILE=$resolvedAgentKeyFile"
}
Write-Host ("searchConfigured: " + [bool]($resolvedSearchApiUrl -and $resolvedAgentKeyFile))
if ($env:AWS_SHARED_CREDENTIALS_FILE) {
  $envPairs += "AWS_SHARED_CREDENTIALS_FILE=$($env:AWS_SHARED_CREDENTIALS_FILE)"
}
if ($env:AWS_CONFIG_FILE) {
  $envPairs += "AWS_CONFIG_FILE=$($env:AWS_CONFIG_FILE)"
}
if ($UserProfile) {
  $envPairs += "USERPROFILE=$UserProfile"
}
if ($HomePath) {
  $envPairs += "HOME=$HomePath"
}
if ($GrokHome) {
  $grokEnv = if ($resolvedGrokDir) { $resolvedGrokDir } else { Join-Path $GrokHome '.grok' }
  $envPairs += "GROK_HOME=$grokEnv"
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

if ($resolvedCred) {
  $user = $resolvedCred.UserName
  if ($DryRun) {
    Write-Host "[DryRun] nssm set $ServiceName ObjectName $user ***"
  }
  else {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($resolvedCred.Password)
    try {
      $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
      # FR #4164: discard nssm output (must never echo the password); return only exit code.
      $null = & $nssm set $ServiceName ObjectName $user $plain 2>&1 | Out-Null
      $code = [int]$LASTEXITCODE
      if ($code -ne 0) { throw "nssm ObjectName failed: $code" }
    }
    finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
      $plain = $null
    }
  }
}

$logonMode = if ($resolvedCred) { "Credential ($($resolvedCred.UserName))" } else { 'LocalSystem' }
Write-Host "Service: $ServiceName"
Write-Host "InstallRoot: $InstallRoot"
Write-Host "Node: $nodePath"
Write-Host "Nssm: $nssm"
Write-Host "AWS_PROFILE: $AwsProfile"
Write-Host "Logs: $logDir"
Write-Host "Logon: $logonMode"
if ($UserProfile) {
  Write-Host "USERPROFILE: $UserProfile"
}
else {
  Write-Host 'USERPROFILE: (not set)'
}
if ($HomePath) {
  Write-Host "HOME: $HomePath"
}
else {
  Write-Host 'HOME: (not set)'
}
if ($GrokHome) {
  $grokEnv = if ($resolvedGrokDir) { $resolvedGrokDir } else { Join-Path $GrokHome '.grok' }
  Write-Host "GROK_HOME: $grokEnv"
  $authJson = Join-Path $grokEnv 'auth.json'
  if (-not (Test-Path -LiteralPath $authJson)) {
    $grokBin = if ($GrokCli) { $GrokCli } else { 'grok' }
    Write-Host 'GROK_HOME auth.json missing --- one-time SYSTEM sign-in required:'
    Write-Host ("  set HOME={0} && set USERPROFILE={0} && set GROK_HOME={1} && run as SYSTEM: `"{2}`" login --device-auth" -f $GrokHome, $grokEnv, $grokBin)
    Write-Host '  (e.g. schtasks /Create /RU SYSTEM once, /Run, then delete the task after auth.json appears)'
  }
}
elseif ($GrokCli -and -not $resolvedCred) {
  Write-Host 'WARN: LocalSystem without -GrokHome --- grok may hit Access is denied on Admin auth.json; prefer -GrokHome (FR #4240)'
}
Write-Host "Start: Start-Service $ServiceName  (or: nssm start $ServiceName)"
if ($DryRun) {
  Write-Host "DryRun complete --- no service changes applied"
}
