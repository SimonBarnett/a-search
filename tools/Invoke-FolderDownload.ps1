<#
.SYNOPSIS
Download affiliate feed for the a-affiliates cwd (FR #4108 / #4195).

.DESCRIPTION
From an affiliate folder under the S3 mount, read folder-marker metadata and
call affiliates downloadOne (via tools/run-folder-download.js). Writes one
decompressed object {provider}/{affiliateid}/{yyyy-mm-dd}.{ext} and bumps
lastdownload / lastok / laststatus / lastsize / lastmod. No parts/ or latest.

Default skips when today's dated feed object already exists (exists);
pass -Force to re-download. Provider cwd requires -All (one run per affiliate
child). Never prints feed URLs, passwords, or tokens.

.PARAMETER Path
Filesystem path under the S3 mount (default: cwd).

.PARAMETER MountRoot
Mount root (default env A_SEARCH_S3_MOUNT, else S:\ if present, else D:\s3).

.PARAMETER All
Provider folder only: download each affiliate child.

.PARAMETER Force
Re-download even if today's dated feed file already exists.

.PARAMETER WhatIf
Alias: -DryRun. Resolve cwd, read meta (redacted), print intended action;
no HTTP fetch, no S3 writes.

.PARAMETER DryRun
Same as -WhatIf.

.PARAMETER Backend
Force aws | rclone | auto for head-object.

.PARAMETER AwsProfile
AWS profile for the Node S3 client (default a-search-redqueen-agents or env).

.PARAMETER NodeExe
Optional path to node.exe (default: node on PATH, then D:\tools\node\node.exe).
#>
[CmdletBinding()]
param(
    [Alias('LiteralPath')][string]$Path,
    [string]$MountRoot,
    [switch]$All,
    [switch]$Force,
    [switch]$WhatIf,
    [Alias('DryRun')][switch]$DryRunSwitch,
    [ValidateSet('auto', 'aws', 'rclone')][string]$Backend = 'auto',
    [string]$AwsProfile,
    [string]$NodeExe,
    [scriptblock]$AwsHeadObject,
    [scriptblock]$AwsGetObjectTagging,
    [scriptblock]$RcloneLsJson,
    [scriptblock]$InvokeDownload,
    [scriptblock]$ListAffiliateChildren
)
# FR #4108: accept -WhatIf and -DryRun (alias) without SupportsShouldProcess
$DryRun = $WhatIf -or $DryRunSwitch

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
. (Join-Path $here 'FolderS3.ps1')

function Resolve-FolderDownloadNode {
    param([string]$NodeExe)
    if ($NodeExe -and (Test-Path -LiteralPath $NodeExe)) { return $NodeExe }
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $fallback = 'D:\tools\node\node.exe'
    if (Test-Path -LiteralPath $fallback) { return $fallback }
    throw 'node_required: install Node or pass -NodeExe'
}

function Resolve-FolderDownloadAwsProfile {
    param([string]$AwsProfile)
    if ($AwsProfile) { return $AwsProfile }
    if ($env:A_SEARCH_AGENTS_AWS_PROFILE) { return $env:A_SEARCH_AGENTS_AWS_PROFILE }
    if ($env:AWS_PROFILE) { return $env:AWS_PROFILE }
    return 'a-search-redqueen-agents'
}

function ConvertTo-FolderDownloadMetaHashtable {
    param($Metadata)
    $h = @{}
    if (-not $Metadata) { return $h }
    if ($Metadata -is [hashtable]) {
        foreach ($k in $Metadata.Keys) {
            $h[[string]$k] = [string]$Metadata[$k]
        }
        return $h
    }
    # IDictionary / OrderedDictionary from FolderS3
    foreach ($k in @($Metadata.Keys)) {
        $h[[string]$k] = [string]$Metadata[$k]
    }
    return $h
}

function Invoke-FolderDownloadOneAffiliate {
    param(
        [Parameter(Mandatory = $true)]$Location,
        [bool]$Force,
        [bool]$DryRun,
        [string]$Backend,
        [string]$AwsProfile,
        [string]$NodeExe,
        $AwsHeadObject,
        $AwsGetObjectTagging,
        $RcloneLsJson,
        $InvokeDownload
    )
    $parts = @($Location.Key.TrimEnd('/').Split('/'))
    if ($parts.Count -lt 2) {
        throw ("not_affiliate: key={0}" -f $Location.Key)
    }
    $provider = $parts[0]
    $affiliateId = $parts[1]

    $marker = Get-FolderS3ObjectMeta -Bucket $Location.Bucket -Key $Location.Key -Backend $Backend `
        -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
        -RcloneLsJson $RcloneLsJson
    $meta = ConvertTo-FolderDownloadMetaHashtable -Metadata $marker.Metadata

    if ($InvokeDownload) {
        $raw = & $InvokeDownload $provider $affiliateId $meta $Force $DryRun $Location.Bucket
        if ($raw -is [string]) {
            return (ConvertFrom-FolderS3Json $raw)
        }
        return $raw
    }

    $node = Resolve-FolderDownloadNode -NodeExe $NodeExe
    $runner = Join-Path $here 'run-folder-download.js'
    $argsObj = [ordered]@{
        provider      = $provider
        affiliateId   = $affiliateId
        bucket        = $Location.Bucket
        force         = [bool]$Force
        dryRun        = [bool]$DryRun
        affiliateMeta = $meta
        awsProfile    = $AwsProfile
    }
    $jsonArgs = ($argsObj | ConvertTo-Json -Compress -Depth 8)
    # FR #4167: never put JSON (feedurl / secrets) on the native argv — WinPS 5.1 also mangles quotes.
    $argsEnvName = 'A_SEARCH_FOLDER_DOWNLOAD_ARGS'
    $prevArgsEnv = [Environment]::GetEnvironmentVariable($argsEnvName, 'Process')
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        [Environment]::SetEnvironmentVariable($argsEnvName, $jsonArgs, 'Process')
        $out = & $node $runner '--args-env' 2>&1
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $prevEap
        if ($null -eq $prevArgsEnv) {
            [Environment]::SetEnvironmentVariable($argsEnvName, $null, 'Process')
        }
        else {
            [Environment]::SetEnvironmentVariable($argsEnvName, $prevArgsEnv, 'Process')
        }
    }
    $text = ($out | ForEach-Object { "$_" }) -join "`n"
    # Never echo secret-bearing lines from native stderr
    $safe = $text -replace '(?i)(api[_-]?key|token|password|secret|feedurl)\s*[:=]\s*\S+', '$1=***'
    if ($code -ne 0 -and [string]::IsNullOrWhiteSpace($safe)) {
        throw "download_failed: node exit $code"
    }
    $line = ($safe -split "`n" | Where-Object { $_.Trim().StartsWith('{') } | Select-Object -Last 1)
    if (-not $line) {
        throw ("download_failed: {0}" -f ($safe.Trim()))
    }
    return (ConvertFrom-FolderS3Json $line)
}

function Get-FolderDownloadResultProp {
    param($Result, [string]$Name)
    if ($null -eq $Result) { return $null }
    if ($Result -is [hashtable] -or $Result -is [System.Collections.IDictionary]) {
        if ($Result.Contains($Name)) { return $Result[$Name] }
        if ($Result.ContainsKey -and $Result.ContainsKey($Name)) { return $Result[$Name] }
        return $null
    }
    $prop = $Result.PSObject.Properties[$Name]
    if ($null -ne $prop) { return $prop.Value }
    return $null
}

function Write-FolderDownloadSummary {
    param($Result, [string]$Provider, [string]$AffiliateId)
    $p = Get-FolderDownloadResultProp $Result 'provider'
    if (-not $p) { $p = $Provider }
    $a = Get-FolderDownloadResultProp $Result 'affiliateId'
    if (-not $a) { $a = $AffiliateId }
    $status = [string](Get-FolderDownloadResultProp $Result 'status')
    $size = Get-FolderDownloadResultProp $Result 'size'
    $dated = [string](Get-FolderDownloadResultProp $Result 'datedKey')
    $key = [string](Get-FolderDownloadResultProp $Result 'key')
    if ([string]::IsNullOrEmpty($key)) { $key = $dated }
    $feedSet = Get-FolderDownloadResultProp $Result 'feedurlSet'
    $feed = 'n/a'
    if ($null -ne $feedSet) {
        $feed = if ($feedSet) { '***set***' } else { '(missing)' }
    }
    if ($status -eq 'dry_run') {
        $fmt = Get-FolderDownloadResultProp $Result 'format'
        $comp = Get-FolderDownloadResultProp $Result 'compression'
        Write-Output ("dry_run provider={0} affiliateid={1} feedurl={2} format={3} compression={4} key={5}" -f `
                $p, $a, $feed, $fmt, $comp, $key)
        return
    }
    Write-Output ("provider={0} affiliateid={1} status={2} size={3} key={4}" -f `
            $p, $a, $status, $size, $key)
}

try {
    $target = if ($Path) { $Path } else { (Get-Location).Path }
    $loc = ConvertTo-FolderS3Location -Path $target -MountRoot $MountRoot

    if ([string]::IsNullOrEmpty($loc.Key)) {
        throw ("bucket_root: s3://{0}/ is the bucket root; cd into a provider/affiliate folder" -f $loc.Bucket)
    }

    if ($loc.Bucket.ToLowerInvariant() -ne 'a-affiliates') {
        [Console]::Error.WriteLine("not_a_affiliates: Invoke-FolderDownload only works under a-affiliates (got bucket=$($loc.Bucket) kind=$($loc.Kind))")
        exit 3
    }

    if ($loc.Kind -eq 'affiliate-child') {
        [Console]::Error.WriteLine("not_affiliate: kind=$($loc.Kind); cd to the affiliate folder (not parts/)")
        exit 3
    }
    if ($loc.Kind -eq 'a-affiliates-root') {
        [Console]::Error.WriteLine('not_affiliate: cwd is a-affiliates bucket root; cd into provider or affiliate')
        exit 3
    }
    if ($loc.Kind -notin @('provider', 'affiliate')) {
        [Console]::Error.WriteLine("not_affiliate: kind=$($loc.Kind); run inside a-affiliates/{provider} or .../{affiliateid}")
        exit 3
    }

    $profile = Resolve-FolderDownloadAwsProfile -AwsProfile $AwsProfile
    # FR #4167: one AWS identity for marker reads (aws CLI) and Node S3 writes
    $prevAwsProfile = [Environment]::GetEnvironmentVariable('AWS_PROFILE', 'Process')
    [Environment]::SetEnvironmentVariable('AWS_PROFILE', $profile, 'Process')
    try {
        $failures = 0
        $results = @()

        if ($loc.Kind -eq 'affiliate') {
            $r = Invoke-FolderDownloadOneAffiliate -Location $loc -Force:$Force -DryRun:$DryRun `
                -Backend $Backend -AwsProfile $profile -NodeExe $NodeExe `
                -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
                -RcloneLsJson $RcloneLsJson -InvokeDownload $InvokeDownload
            $results += $r
            $parts = @($loc.Key.TrimEnd('/').Split('/'))
            Write-FolderDownloadSummary -Result $r -Provider $parts[0] -AffiliateId $parts[1]
            $ok = Get-FolderDownloadResultProp $r 'ok'
            $st = [string](Get-FolderDownloadResultProp $r 'status')
            if (-not $ok -and $st -ne 'exists' -and $st -ne 'parts_exists') { $failures += 1 }
            $feedSet = Get-FolderDownloadResultProp $r 'feedurlSet'
            if ($DryRun -and -not $feedSet) {
                [Console]::Error.WriteLine('missing_feedurl: affiliate marker has no feedurl')
                exit 1
            }
            if ($failures -gt 0) { exit 1 }
            exit 0
        }

        # provider folder
        if (-not $All) {
            [Console]::Error.WriteLine('provider_folder_needs_all: cwd is a provider folder; pass -All to download each affiliate child')
            exit 4
        }

        $children = @()
        if ($ListAffiliateChildren) {
            $children = @(& $ListAffiliateChildren $loc)
        }
        else {
            $dirs = Get-ChildItem -LiteralPath $loc.Path -Directory -ErrorAction SilentlyContinue
            foreach ($d in @($dirs)) {
                $childLoc = ConvertTo-FolderS3Location -Path $d.FullName -MountRoot $loc.MountRoot
                if ($childLoc.Kind -eq 'affiliate') { $children += $childLoc }
            }
        }

        if (-not @($children).Count) {
            Write-Output 'no_affiliate_children'
            exit 0
        }

        $failedIds = @()
        foreach ($c in $children) {
            try {
                $r = Invoke-FolderDownloadOneAffiliate -Location $c -Force:$Force -DryRun:$DryRun `
                    -Backend $Backend -AwsProfile $profile -NodeExe $NodeExe `
                    -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
                    -RcloneLsJson $RcloneLsJson -InvokeDownload $InvokeDownload
                $results += $r
                $parts = @($c.Key.TrimEnd('/').Split('/'))
                Write-FolderDownloadSummary -Result $r -Provider $parts[0] -AffiliateId $parts[1]
                $ok = Get-FolderDownloadResultProp $r 'ok'
                $st = [string](Get-FolderDownloadResultProp $r 'status')
                $feedSet = Get-FolderDownloadResultProp $r 'feedurlSet'
                if (-not $ok -and $st -ne 'exists' -and $st -ne 'parts_exists') {
                    $failures += 1
                    $failedIds += $parts[1]
                }
                elseif ($DryRun -and -not $feedSet) {
                    $failures += 1
                    $failedIds += $parts[1]
                }
            }
            catch {
                $failures += 1
                $parts = @($c.Key.TrimEnd('/').Split('/'))
                $failedIds += $parts[1]
                $safe = $_.Exception.Message -replace '(?i)(api[_-]?key|token|password|secret|feedurl)\s*[:=]\s*\S+', '$1=***'
                Write-Output ("provider={0} affiliateid={1} status=error error={2}" -f $parts[0], $parts[1], $safe)
            }
        }

        Write-Output ("summary ok={0} failed={1}" -f (@($results).Count - $failures), $failures)
        if ($failedIds.Count) {
            Write-Output ("failed_affiliateids={0}" -f ($failedIds -join ','))
        }
        if ($failures -gt 0) { exit 1 }
        exit 0
    }
    finally {
        if ($null -eq $prevAwsProfile) {
            [Environment]::SetEnvironmentVariable('AWS_PROFILE', $null, 'Process')
        }
        else {
            [Environment]::SetEnvironmentVariable('AWS_PROFILE', $prevAwsProfile, 'Process')
        }
    }
}
catch {
    $msg = $_.Exception.Message
    $safe = $msg -replace '(?i)(api[_-]?key|token|password|secret|feedurl)\s*[:=]\s*\S+', '$1=***'
    [Console]::Error.WriteLine($safe)
    if ($safe -match '^path_outside_mount') {
        exit 2
    }
    if ($safe -match '^bucket_root') {
        exit 5
    }
    exit 1
}
