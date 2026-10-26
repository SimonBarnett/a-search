<#
.SYNOPSIS
Install a-search folder tools (`search` + `meta`) into a tools folder on PATH (FR #5145 / #5148).

.DESCRIPTION
Copies search + meta shims and helpers into -ToolsDir (default C:\ai\tools):
search.ps1, Invoke-FolderSearch.ps1, meta.ps1, Get-FolderMeta.ps1,
FolderProgress.ps1, FolderS3.ps1, search.cmd, meta.cmd, and search.config.json.
Creates the directory and a User PATH entry when missing. On redeploy, keeps an
existing search.config.json (does not overwrite AwsProfile / SearchApiUrl). No nssm.

Run from the deploy checkout on redqueen:
  .\tools\Install-SearchCommand.ps1
  .\tools\Install-SearchCommand.ps1 -ToolsDir C:\ai\tools

.PARAMETER ToolsDir
Install directory (default C:\ai\tools).

.PARAMETER ForceConfig
Overwrite search.config.json even when one already exists.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$ToolsDir = 'C:\ai\tools',
    [switch]$ForceConfig,
    [switch]$SkipPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
$required = @(
    'search.ps1',
    'Invoke-FolderSearch.ps1',
    'meta.ps1',
    'Get-FolderMeta.ps1',
    'FolderProgress.ps1',
    'FolderS3.ps1',
    'search.config.json'
)
foreach ($name in $required) {
    $src = Join-Path $here $name
    if (-not (Test-Path -LiteralPath $src)) {
        throw "install_source_missing: $src"
    }
}

if (-not (Test-Path -LiteralPath $ToolsDir)) {
    if ($PSCmdlet.ShouldProcess($ToolsDir, 'Create tools directory')) {
        New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
        Write-Host "Created $ToolsDir"
    }
}

$copyNames = @(
    'search.ps1',
    'Invoke-FolderSearch.ps1',
    'meta.ps1',
    'Get-FolderMeta.ps1',
    'FolderProgress.ps1',
    'FolderS3.ps1'
)
foreach ($name in $copyNames) {
    $src = Join-Path $here $name
    $dst = Join-Path $ToolsDir $name
    if ($PSCmdlet.ShouldProcess($dst, "Copy $name")) {
        Copy-Item -LiteralPath $src -Destination $dst -Force
        Write-Host "Copied $name -> $dst"
    }
}

$cfgSrc = Join-Path $here 'search.config.json'
$cfgDst = Join-Path $ToolsDir 'search.config.json'
if ((Test-Path -LiteralPath $cfgDst) -and -not $ForceConfig) {
    Write-Host "Kept existing config $cfgDst (pass -ForceConfig to replace)"
} else {
    if ($PSCmdlet.ShouldProcess($cfgDst, 'Write search.config.json')) {
        Copy-Item -LiteralPath $cfgSrc -Destination $cfgDst -Force
        Write-Host "Wrote $cfgDst"
    }
}

$cmdPath = Join-Path $ToolsDir 'search.cmd'
$cmdBody = "@echo off`r`nrem FR #5145: shim for search.ps1 on PATH`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0search.ps1`" %*`r`nexit /b %ERRORLEVEL%`r`n"
if ($PSCmdlet.ShouldProcess($cmdPath, 'Write search.cmd')) {
    [System.IO.File]::WriteAllText($cmdPath, $cmdBody)
    Write-Host "Wrote $cmdPath"
}

$metaCmdPath = Join-Path $ToolsDir 'meta.cmd'
$metaCmdBody = "@echo off`r`nrem FR #5148: shim for meta.ps1 on PATH`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0meta.ps1`" %*`r`nexit /b %ERRORLEVEL%`r`n"
if ($PSCmdlet.ShouldProcess($metaCmdPath, 'Write meta.cmd')) {
    [System.IO.File]::WriteAllText($metaCmdPath, $metaCmdBody)
    Write-Host "Wrote $metaCmdPath"
}

if (-not $SkipPath) {
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not $userPath) { $userPath = '' }
    $parts = @($userPath -split ';' | Where-Object { $_ -and $_.Trim() })
    $norm = [IO.Path]::GetFullPath($ToolsDir).TrimEnd('\')
    $found = $false
    foreach ($p in $parts) {
        try {
            if ([IO.Path]::GetFullPath($p).TrimEnd('\') -ieq $norm) { $found = $true; break }
        } catch { }
    }
    if (-not $found) {
        $newPath = if ($userPath.Trim()) { ($userPath.TrimEnd(';') + ';' + $norm) } else { $norm }
        if ($PSCmdlet.ShouldProcess('User PATH', "Append $norm")) {
            [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
            $env:Path = $env:Path.TrimEnd(';') + ';' + $norm
            Write-Host "Appended $norm to User PATH (new shells pick this up)"
        }
    } else {
        Write-Host "User PATH already contains $norm"
    }
}

Write-Host "Install-SearchCommand done. From a club folder on S: type: search   or   meta"
exit 0
