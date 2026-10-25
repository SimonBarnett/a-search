#Requires -Version 5.1
<#
.SYNOPSIS
  Deploy / update Node walrus SQL drain code from a repo tree (FR #5023).

.DESCRIPTION
  Copies the checked-in manifest paths onto InstallRoot, runs a require-graph
  load check, npm install --omit=dev, then restarts a-search-walrus-sql-drain.
  Never overwrites walrus\aws or *.password secrets. On load-check or service
  start failure, restores the timestamped backup and exits non-zero.

  redqueen/src is in the manifest while promoteInToLive requires
  ../../redqueen/src/pageSelect.js. Drop it after #5022 moves pageSelect into shared.

.PARAMETER SourceRoot
  Repo root that holds walrus/, providers/, shared/, etc. Default: parent of this
  script's walrus/ folder (two levels up from walrus/install).

.PARAMETER InstallRoot
  Live install folder (default C:\ai\a-search). Root package.json lives here;
  npm install --omit=dev runs in InstallRoot.

.PARAMETER ServiceName
  Windows service name (default a-search-walrus-sql-drain).

.PARAMETER NodeExe
  Path to node.exe (default: node on PATH, or D:\Tools\node\node.exe when present).

.PARAMETER ManifestPath
  Override path to walrus-sql-drain-deploy-manifest.json.

.PARAMETER SkipNpm
  Skip npm install --omit=dev.

.PARAMETER SkipService
  Skip Stop/Start of the Windows service (still runs load check + copy).

.PARAMETER Force
  Allow deploy when the service is missing (copy + npm + load check only).

.PARAMETER WhatIf
  Print the plan only; do not copy, npm, or restart.
#>
[CmdletBinding()]
param(
  [string]$SourceRoot,
  [string]$InstallRoot = 'C:\ai\a-search',
  [string]$ServiceName = 'a-search-walrus-sql-drain',
  [string]$NodeExe,
  [string]$ManifestPath,
  [switch]$SkipNpm,
  [switch]$SkipService,
  [switch]$Force,
  [Alias('DryRun')][switch]$WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $SourceRoot) {
  $SourceRoot = (Resolve-Path -LiteralPath (Join-Path $scriptDir '..\..')).Path
}
$SourceRoot = (Resolve-Path -LiteralPath $SourceRoot).Path
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)

if (-not $ManifestPath) {
  $ManifestPath = Join-Path $scriptDir 'walrus-sql-drain-deploy-manifest.json'
}
$AssertGraphJs = Join-Path $scriptDir 'assert-walrus-sql-drain-graph.js'
# After copy, assert lives under InstallRoot.
$InstallAssertGraphJs = Join-Path $InstallRoot 'walrus\install\assert-walrus-sql-drain-graph.js'

function Resolve-NodePath {
  param([string]$NodeExe)
  if ($NodeExe) {
    if ([System.IO.Path]::IsPathRooted($NodeExe) -and (Test-Path -LiteralPath $NodeExe)) {
      return $NodeExe
    }
    $cmd = Get-Command $NodeExe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    throw "node.exe not found ($NodeExe)"
  }
  $preferred = 'D:\Tools\node\node.exe'
  if (Test-Path -LiteralPath $preferred) { return $preferred }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw 'node.exe not found (pass -NodeExe or install node on PATH)'
}

function Read-DeployManifest {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "manifest_missing: $Path"
  }
  $raw = [System.IO.File]::ReadAllText($Path)
  $obj = $raw | ConvertFrom-Json
  if (-not $obj.paths -or @($obj.paths).Count -lt 1) {
    throw "manifest_empty_paths: $Path"
  }
  return @($obj.paths | ForEach-Object { [string]$_ })
}

function Test-IsSecretOrAwsPath {
  param([string]$RelativePath)
  $norm = ($RelativePath -replace '/', '\').TrimStart('\')
  if ($norm -match '(?i)^walrus\\aws($|\\)') { return $true }
  if ($norm -match '(?i)\.password$') { return $true }
  if ($norm -match '(?i)(^|\\)credentials$') { return $true }
  return $false
}

function Copy-TreeRobocopy {
  param(
    [string]$Source,
    [string]$Dest,
    [switch]$DryRun
  )
  if ($DryRun) {
    Write-Host "WhatIf: copy tree $Source -> $Dest"
    return
  }
  $destParent = Split-Path -Parent $Dest
  if ($destParent -and -not (Test-Path -LiteralPath $destParent)) {
    New-Item -ItemType Directory -Path $destParent -Force | Out-Null
  }
  # /E subdirs including empty; /NFL /NDL /NJH /NJS quieter; /XD skip aws under walrus
  $xd = @()
  if (($Source -replace '/', '\') -match '(?i)\\walrus$') {
    $xd = @('/XD', 'aws')
  }
  $args = @($Source, $Dest, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np') + $xd
  & robocopy @args | Out-Null
  $code = $LASTEXITCODE
  # robocopy 0-7 = success-ish; >=8 failure
  if ($code -ge 8) {
    throw "robocopy_failed exit=$code source=$Source dest=$Dest"
  }
  $global:LASTEXITCODE = 0
}

function Backup-ManifestPaths {
  param(
    [string]$InstallRoot,
    [string[]]$Paths,
    [string]$BackupRoot,
    [switch]$DryRun
  )
  if ($DryRun) {
    Write-Host "WhatIf: backup InstallRoot paths -> $BackupRoot"
    foreach ($rel in $Paths) {
      $src = Join-Path $InstallRoot ($rel -replace '/', '\')
      if (Test-Path -LiteralPath $src) {
        Write-Host "WhatIf:   backup $rel"
      }
    }
    return
  }
  New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
  foreach ($rel in $Paths) {
    if (Test-IsSecretOrAwsPath -RelativePath $rel) {
      Write-Host "skip backup (secret/aws): $rel"
      continue
    }
    $src = Join-Path $InstallRoot ($rel -replace '/', '\')
    if (-not (Test-Path -LiteralPath $src)) { continue }
    $dest = Join-Path $BackupRoot ($rel -replace '/', '\')
    $item = Get-Item -LiteralPath $src
    if ($item.PSIsContainer) {
      Copy-TreeRobocopy -Source $src -Dest $dest
    } else {
      $parent = Split-Path -Parent $dest
      if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
      }
      Copy-Item -LiteralPath $src -Destination $dest -Force
    }
  }
  # Also back up walrus\install helpers we may overwrite via walrus/src only;
  # manifest may not list walrus/install — copy assert + this script if present under install.
  $installHelpers = @(
    'walrus\install\assert-walrus-sql-drain-graph.js',
    'walrus\install\walrus-sql-drain-deploy-manifest.json',
    'walrus\install\Deploy-WalrusSqlDrain.ps1'
  )
  foreach ($rel in $installHelpers) {
    $src = Join-Path $InstallRoot $rel
    if (-not (Test-Path -LiteralPath $src)) { continue }
    $dest = Join-Path $BackupRoot $rel
    $parent = Split-Path -Parent $dest
    if (-not (Test-Path -LiteralPath $parent)) {
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Copy-Item -LiteralPath $src -Destination $dest -Force
  }
}

function Restore-FromBackup {
  param(
    [string]$InstallRoot,
    [string]$BackupRoot,
    [string[]]$Paths
  )
  if (-not (Test-Path -LiteralPath $BackupRoot)) {
    Write-Warning "rollback_skipped: backup missing $BackupRoot"
    return
  }
  Write-Warning "Rolling back InstallRoot from $BackupRoot"
  foreach ($rel in $Paths) {
    if (Test-IsSecretOrAwsPath -RelativePath $rel) { continue }
    $bak = Join-Path $BackupRoot ($rel -replace '/', '\')
    $dest = Join-Path $InstallRoot ($rel -replace '/', '\')
    if (-not (Test-Path -LiteralPath $bak)) {
      # New path that did not exist before: remove the copy we just made.
      if (Test-Path -LiteralPath $dest) {
        Remove-Item -LiteralPath $dest -Recurse -Force -ErrorAction SilentlyContinue
      }
      continue
    }
    $item = Get-Item -LiteralPath $bak
    if ($item.PSIsContainer) {
      if (Test-Path -LiteralPath $dest) {
        Remove-Item -LiteralPath $dest -Recurse -Force
      }
      Copy-TreeRobocopy -Source $bak -Dest $dest
    } else {
      $parent = Split-Path -Parent $dest
      if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
      }
      Copy-Item -LiteralPath $bak -Destination $dest -Force
    }
  }
}

function Copy-ManifestPaths {
  param(
    [string]$SourceRoot,
    [string]$InstallRoot,
    [string[]]$Paths,
    [switch]$DryRun
  )
  foreach ($rel in $Paths) {
    if (Test-IsSecretOrAwsPath -RelativePath $rel) {
      Write-Host "skip copy (secret/aws): $rel"
      continue
    }
    $src = Join-Path $SourceRoot ($rel -replace '/', '\')
    $dest = Join-Path $InstallRoot ($rel -replace '/', '\')
    if (-not (Test-Path -LiteralPath $src)) {
      throw "source_missing: $src"
    }
    $item = Get-Item -LiteralPath $src
    if ($item.PSIsContainer) {
      Copy-TreeRobocopy -Source $src -Dest $dest -DryRun:$DryRun
      # Belt: never leave a copied walrus\aws from SourceRoot over InstallRoot.
      if (($rel -replace '/', '\') -match '(?i)^walrus$') {
        $awsDest = Join-Path $dest 'aws'
        # We excluded aws via robocopy /XD; do not delete InstallRoot\walrus\aws.
        if ($DryRun) {
          Write-Host "WhatIf: preserve InstallRoot walrus\aws (never overwrite)"
        }
      }
    } else {
      if ($DryRun) {
        Write-Host "WhatIf: copy file $src -> $dest"
      } else {
        $parent = Split-Path -Parent $dest
        if (-not (Test-Path -LiteralPath $parent)) {
          New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }
        Copy-Item -LiteralPath $src -Destination $dest -Force
      }
    }
  }
}

function Copy-DeployHelpers {
  param(
    [string]$SourceRoot,
    [string]$InstallRoot,
    [switch]$DryRun
  )
  $helpers = @(
    'walrus\install\assert-walrus-sql-drain-graph.js',
    'walrus\install\walrus-sql-drain-deploy-manifest.json',
    'walrus\install\Deploy-WalrusSqlDrain.ps1'
  )
  foreach ($rel in $helpers) {
    $src = Join-Path $SourceRoot $rel
    if (-not (Test-Path -LiteralPath $src)) { continue }
    $dest = Join-Path $InstallRoot $rel
    if ($DryRun) {
      Write-Host "WhatIf: copy helper $rel"
      continue
    }
    $parent = Split-Path -Parent $dest
    if (-not (Test-Path -LiteralPath $parent)) {
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Copy-Item -LiteralPath $src -Destination $dest -Force
  }
}

function Invoke-LoadCheck {
  param(
    [string]$NodePath,
    [string]$InstallRoot,
    [string]$AssertJs
  )
  if (-not (Test-Path -LiteralPath $AssertJs)) {
    throw "load_check_missing: $AssertJs"
  }
  Write-Host "Load check: $NodePath $AssertJs (cwd=$InstallRoot)"
  Push-Location -LiteralPath $InstallRoot
  try {
    & $NodePath $AssertJs
    if ($LASTEXITCODE -ne 0) {
      throw "load_check_failed exit=$LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Invoke-NpmOmitDev {
  param(
    [string]$InstallRoot,
    [string]$NodePath,
    [switch]$DryRun
  )
  if ($DryRun) {
    Write-Host "WhatIf: npm install --omit=dev in $InstallRoot"
    return
  }
  $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npmCmd) {
    # npm.cmd beside node.exe
    $npmBeside = Join-Path (Split-Path -Parent $NodePath) 'npm.cmd'
    if (Test-Path -LiteralPath $npmBeside) {
      $npmCmd = Get-Item -LiteralPath $npmBeside
    } else {
      throw 'npm not found on PATH'
    }
  }
  Write-Host "npm install --omit=dev in $InstallRoot"
  Push-Location -LiteralPath $InstallRoot
  try {
    & $npmCmd.Source install --omit=dev
    if ($LASTEXITCODE -ne 0) {
      throw "npm_install_failed exit=$LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Restart-DrainService {
  param(
    [string]$ServiceName,
    [switch]$DryRun,
    [switch]$Force,
    [switch]$SkipService
  )
  if ($SkipService) {
    Write-Host "SkipService: not restarting $ServiceName"
    return
  }
  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if (-not $svc) {
    if ($Force) {
      Write-Warning "service_missing: $ServiceName (Force: continue without restart)"
      return
    }
    throw "service_missing: $ServiceName (pass -Force to skip restart, or -SkipService)"
  }
  if ($DryRun) {
    Write-Host "WhatIf: Restart-Service $ServiceName (Stop then Start)"
    return
  }
  Write-Host "Stopping $ServiceName"
  Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Write-Host "Starting $ServiceName"
  Start-Service -Name $ServiceName
  Start-Sleep -Seconds 2
  $after = Get-Service -Name $ServiceName
  if ($after.Status -ne 'Running') {
    throw "service_start_failed: $ServiceName status=$($after.Status)"
  }
  Write-Host "Service $ServiceName is Running"
}

# --- main ---
$nodePath = Resolve-NodePath -NodeExe $NodeExe
$paths = Read-DeployManifest -Path $ManifestPath

Write-Host "SourceRoot=$SourceRoot"
Write-Host "InstallRoot=$InstallRoot"
Write-Host "ServiceName=$ServiceName"
Write-Host "Manifest=$ManifestPath"
Write-Host "Node=$nodePath"
Write-Host "Paths=$($paths -join ', ')"

foreach ($rel in $paths) {
  $src = Join-Path $SourceRoot ($rel -replace '/', '\')
  if (-not (Test-Path -LiteralPath $src)) {
    throw "source_missing: $src (manifest path '$rel')"
  }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $InstallRoot ".deploy-backup\$stamp"

if ($WhatIf) {
  Write-Host 'WhatIf plan:'
  Write-Host "  1. Verify source paths (ok)"
  Write-Host "  2. Backup replaced paths -> $backupRoot"
  Write-Host '  3. Exclude walrus\aws and *.password from overwrite'
  Write-Host '  4. Copy manifest paths SourceRoot -> InstallRoot'
  Write-Host '  5. Copy walrus/install deploy helpers'
  Write-Host '  6. Load check: node walrus/install/assert-walrus-sql-drain-graph.js'
  if (-not $SkipNpm) {
    Write-Host '  7. npm install --omit=dev in InstallRoot'
  } else {
    Write-Host '  7. SkipNpm'
  }
  if (-not $SkipService) {
    Write-Host "  8. Restart service $ServiceName (rollback on failure)"
  } else {
    Write-Host '  8. SkipService'
  }
  Backup-ManifestPaths -InstallRoot $InstallRoot -Paths $paths -BackupRoot $backupRoot -DryRun
  Copy-ManifestPaths -SourceRoot $SourceRoot -InstallRoot $InstallRoot -Paths $paths -DryRun
  Copy-DeployHelpers -SourceRoot $SourceRoot -InstallRoot $InstallRoot -DryRun
  if (-not $SkipNpm) { Invoke-NpmOmitDev -InstallRoot $InstallRoot -NodePath $nodePath -DryRun }
  Restart-DrainService -ServiceName $ServiceName -DryRun -Force:$Force -SkipService:$SkipService
  Write-Host 'WhatIf: done (no changes)'
  exit 0
}

if (-not (Test-Path -LiteralPath $InstallRoot)) {
  New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
}

Backup-ManifestPaths -InstallRoot $InstallRoot -Paths $paths -BackupRoot $backupRoot
try {
  Copy-ManifestPaths -SourceRoot $SourceRoot -InstallRoot $InstallRoot -Paths $paths
  Copy-DeployHelpers -SourceRoot $SourceRoot -InstallRoot $InstallRoot

  # Load check BEFORE service restart (and before we trust the new tree).
  $assertJs = $InstallAssertGraphJs
  if (-not (Test-Path -LiteralPath $assertJs)) {
    # Fresh install: use source assert against InstallRoot layout after copy.
    $assertJs = Join-Path $InstallRoot 'walrus\install\assert-walrus-sql-drain-graph.js'
  }
  if (-not (Test-Path -LiteralPath $assertJs)) {
    $assertJs = $AssertGraphJs
  }
  Invoke-LoadCheck -NodePath $nodePath -InstallRoot $InstallRoot -AssertJs $assertJs

  if (-not $SkipNpm) {
    Invoke-NpmOmitDev -InstallRoot $InstallRoot -NodePath $nodePath
  }

  try {
    Restart-DrainService -ServiceName $ServiceName -Force:$Force -SkipService:$SkipService
  } catch {
    Write-Warning "service_restart_failed: $($_.Exception.Message)"
    Restore-FromBackup -InstallRoot $InstallRoot -BackupRoot $backupRoot -Paths $paths
    if (-not $SkipNpm) {
      try { Invoke-NpmOmitDev -InstallRoot $InstallRoot -NodePath $nodePath } catch {
        Write-Warning "npm_after_rollback_failed: $($_.Exception.Message)"
      }
    }
    try {
      Restart-DrainService -ServiceName $ServiceName -Force:$Force -SkipService:$SkipService
    } catch {
      Write-Warning "service_restart_after_rollback_failed: $($_.Exception.Message)"
    }
    throw
  }
} catch {
  Write-Warning "deploy_failed: $($_.Exception.Message)"
  Restore-FromBackup -InstallRoot $InstallRoot -BackupRoot $backupRoot -Paths $paths
  throw
}

Write-Host "Deploy ok. Backup at $backupRoot"
exit 0
