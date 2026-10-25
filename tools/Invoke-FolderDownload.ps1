<#
.SYNOPSIS
Download affiliate feed for the a-affiliates cwd (FR #4108 / #4195).

.DESCRIPTION
From an affiliate folder under the S3 mount, read folder-marker metadata and
call affiliates downloadOne (via tools/run-folder-download.js). Writes one
decompressed product object {provider}/{affiliateid}/{yyyy-mm-dd}.{ext} and
bumps lastdownload / lastok / laststatus / lastsize / lastmod. No parts/ or latest.

For Awin, also downloads promotions/vouchers (coupons) via Publisher API into
{provider}/{affiliateid}/{yyyy-mm-dd}.coupons.json (needs C:\passwords\awin.apitoken.txt).
Joined no-feed affiliates still get the coupons file.

Progress steps and /|\| spinner go to stderr (like onboard); summaries to stdout.

Default skips when today's dated feed/coupons object already exists (exists);
pass -Force to re-download.

From bucket root: walk every provider with enabled=1, then every merchant with
enabled=1 whose lastdownload is empty or older than defaultage days (merchant >
provider > root precedence; root defaultage on _root/). From an enabled
provider folder: same merchant selection. -All ignores age but still skips
disabled providers. Never prints feed URLs, passwords, or tokens.

.PARAMETER Path
Filesystem path under the S3 mount (default: cwd).

.PARAMETER MountRoot
Mount root (default env A_SEARCH_S3_MOUNT, else S:\ if present, else D:\s3).

.PARAMETER All
From bucket root or an enabled provider folder: download every merchant under
enabled providers, ignoring defaultage / lastdownload freshness. Does not
enable disabled providers.

.PARAMETER Force
Re-download even if today's dated feed/coupons file already exists.

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
. (Join-Path $here 'FolderProgress.ps1')

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

function Read-FolderDownloadSecretFile {
    param([string]$FilePath)
    if (-not $FilePath -or -not (Test-Path -LiteralPath $FilePath)) { return $null }
    $lines = @(Get-Content -LiteralPath $FilePath -ErrorAction Stop)
    if ($lines.Count -lt 1) { return $null }
    $v = ([string]$lines[0]).Trim()
    if ([string]::IsNullOrWhiteSpace($v)) { return $null }
    return $v
}

function Resolve-FolderDownloadAwinApiToken {
    if ($env:AWIN_ACCESS_TOKEN) {
        $t = [string]$env:AWIN_ACCESS_TOKEN
        if (-not [string]::IsNullOrWhiteSpace($t)) { return $t.Trim() }
    }
    return (Read-FolderDownloadSecretFile 'C:\passwords\awin.apitoken.txt')
}

function Get-FolderDownloadProviderMeta {
    param([string]$Bucket, [string]$Provider, [string]$Backend, $AwsHeadObject, $AwsGetObjectTagging, $RcloneLsJson)
    $key = "$Provider/"
    $marker = Get-FolderS3ObjectMeta -Bucket $Bucket -Key $key -Backend $Backend `
        -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
        -RcloneLsJson $RcloneLsJson
    return (ConvertTo-FolderDownloadMetaHashtable -Metadata $marker.Metadata)
}

function Invoke-FolderDownloadCoupons {
    param(
        [string]$Provider,
        [string]$AffiliateId,
        [string]$Bucket,
        [hashtable]$ProviderMeta,
        [bool]$Force,
        [bool]$DryRun,
        [string]$AwsProfile,
        [string]$NodeExe
    )
    if ($Provider -ne 'awin') {
        return [pscustomobject]@{ ok = $true; status = 'skipped_provider'; count = 0; key = $null }
    }
    $node = Resolve-FolderDownloadNode -NodeExe $NodeExe
    $runner = Join-Path $here 'run-folder-coupons.js'
    $token = Resolve-FolderDownloadAwinApiToken
    $publisherId = '2889699'
    if ($ProviderMeta -and $ProviderMeta['publisherid']) { $publisherId = [string]$ProviderMeta['publisherid'] }
    $apibase = 'https://api.awin.com'
    if ($ProviderMeta -and $ProviderMeta['apibase']) { $apibase = [string]$ProviderMeta['apibase'] }

    $argsObj = [ordered]@{
        provider    = $Provider
        affiliateId = $AffiliateId
        bucket      = $Bucket
        publisherId = $publisherId
        apibase     = $apibase
        force       = [bool]$Force
        dryRun      = [bool]$DryRun
        awsProfile  = $AwsProfile
    }
    $jsonArgs = ($argsObj | ConvertTo-Json -Compress -Depth 6)
    $prevArgs = [Environment]::GetEnvironmentVariable('A_SEARCH_FOLDER_COUPONS_ARGS', 'Process')
    $prevTok = [Environment]::GetEnvironmentVariable('AWIN_ACCESS_TOKEN', 'Process')
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        [Environment]::SetEnvironmentVariable('A_SEARCH_FOLDER_COUPONS_ARGS', $jsonArgs, 'Process')
        if ($token) {
            [Environment]::SetEnvironmentVariable('AWIN_ACCESS_TOKEN', $token, 'Process')
        }
        $token = $null
        $label = "Downloading coupons for $Provider/$AffiliateId"
        $jobOut = Invoke-FolderToolWithSpinner -Label $label -ArgumentList @($node, $runner) -ScriptBlock {
            param($nodeExe, $js)
            $o = & $nodeExe $js '--args-env' 2>&1
            return @{ code = $LASTEXITCODE; out = (($o | ForEach-Object { "$_" }) -join "`n") }
        }
        $code = [int]$jobOut.code
        $text = [string]$jobOut.out
        # Word-boundary redact so JSON keys like tokenSet are left intact.
        $safe = $text -replace '(?i)\b(api[_-]?key|token|password|secret)\b\s*[:=]\s*\S+', '$1=***'
        $safe = $safe -replace '(?i)\b(Bearer)\s+\S+', '$1 ***'
        $line = ($safe -split "`n" | Where-Object { $_.Trim().StartsWith('{') } | Select-Object -Last 1)
        if (-not $line) {
            return [pscustomobject]@{ ok = $false; status = 'coupons_failed'; error = $safe; count = 0 }
        }
        $parsed = ConvertFrom-FolderS3Json $line
        if ($code -ne 0 -and -not [bool]$parsed.ok) { return $parsed }
        return $parsed
    }
    finally {
        $ErrorActionPreference = $prevEap
        if ($null -eq $prevArgs) {
            [Environment]::SetEnvironmentVariable('A_SEARCH_FOLDER_COUPONS_ARGS', $null, 'Process')
        }
        else {
            [Environment]::SetEnvironmentVariable('A_SEARCH_FOLDER_COUPONS_ARGS', $prevArgs, 'Process')
        }
        if ($null -eq $prevTok) {
            [Environment]::SetEnvironmentVariable('AWIN_ACCESS_TOKEN', $null, 'Process')
        }
        else {
            [Environment]::SetEnvironmentVariable('AWIN_ACCESS_TOKEN', $prevTok, 'Process')
        }
    }
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

    Write-FolderToolStep ("Download starting provider={0} affiliateid={1} force={2} dryRun={3}" -f $provider, $affiliateId, $Force, $DryRun)
    Write-FolderToolStep 'Reading affiliate marker metadata'
    $marker = Invoke-FolderToolWithSpinner -Label ("Head marker {0}/{1}" -f $provider, $affiliateId) -ArgumentList @(
        $here, $Location.Bucket, $Location.Key, $Backend
    ) -ScriptBlock {
        param($toolsDir, $bucket, $key, $backend)
        . (Join-Path $toolsDir 'FolderS3.ps1')
        return (Get-FolderS3ObjectMeta -Bucket $bucket -Key $key -Backend $backend)
    }
    $meta = ConvertTo-FolderDownloadMetaHashtable -Metadata $marker.Metadata
    Write-FolderToolDetail ("enabled={0} disabledreason={1} feedurl={2}" -f `
            $(if ($meta['enabled']) { $meta['enabled'] } else { '?' }),
            $(if ($meta['disabledreason']) { $meta['disabledreason'] } else { '' }),
            $(if ($meta['feedurl']) { '***set***' } else { '(missing)' }))

    $feedResult = $null
    if ($InvokeDownload) {
        $raw = & $InvokeDownload $provider $affiliateId $meta $Force $DryRun $Location.Bucket
        if ($raw -is [string]) {
            $feedResult = (ConvertFrom-FolderS3Json $raw)
        }
        else {
            $feedResult = $raw
        }
    }
    else {
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
        $argsEnvName = 'A_SEARCH_FOLDER_DOWNLOAD_ARGS'
        $prevArgsEnv = [Environment]::GetEnvironmentVariable($argsEnvName, 'Process')
        $label = "Downloading product feed for $provider/$affiliateId"
        Write-FolderToolStep $label
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            [Environment]::SetEnvironmentVariable($argsEnvName, $jsonArgs, 'Process')
            $out = Invoke-FolderToolWithSpinner -Label $label -ArgumentList @($node, $runner) -ScriptBlock {
                param($nodeExe, $js)
                $o = & $nodeExe $js '--args-env' 2>&1
                return @{ code = $LASTEXITCODE; out = ($o | ForEach-Object { "$_" }) -join "`n" }
            }
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
        $code = 0
        $text = ''
        if ($out -is [hashtable]) {
            $code = [int]$out.code
            $text = [string]$out.out
        }
        else {
            $text = ($out | ForEach-Object { "$_" }) -join "`n"
        }
        $safe = $text -replace '(?i)(api[_-]?key|token|password|secret|feedurl)\s*[:=]\s*\S+', '$1=***'
        if ($code -ne 0 -and [string]::IsNullOrWhiteSpace($safe)) {
            throw "download_failed: node exit $code"
        }
        $line = ($safe -split "`n" | Where-Object { $_.Trim().StartsWith('{') } | Select-Object -Last 1)
        if (-not $line) {
            throw ("download_failed: {0}" -f ($safe.Trim()))
        }
        $feedResult = ConvertFrom-FolderS3Json $line
    }

    $providerMeta = @{}
    if ($provider -eq 'awin') {
        Write-FolderToolStep 'Reading provider marker (publisherid / apibase)'
        $providerMeta = Get-FolderDownloadProviderMeta -Bucket $Location.Bucket -Provider $provider `
            -Backend $Backend -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
            -RcloneLsJson $RcloneLsJson
    }

    Write-FolderToolStep ("Downloading coupons/offers for {0}/{1}" -f $provider, $affiliateId)
    $couponResult = Invoke-FolderDownloadCoupons -Provider $provider -AffiliateId $affiliateId `
        -Bucket $Location.Bucket -ProviderMeta $providerMeta -Force:$Force -DryRun:$DryRun `
        -AwsProfile $AwsProfile -NodeExe $NodeExe

    return [pscustomobject]@{
        feed    = $feedResult
        coupons = $couponResult
        provider = $provider
        affiliateId = $affiliateId
    }
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

function Get-FolderDownloadMetaHashtable {
    param(
        [string]$Bucket,
        [string]$Key,
        [string]$Backend,
        $AwsHeadObject,
        $AwsGetObjectTagging,
        $RcloneLsJson,
        [switch]$SkipTags
    )
    $marker = Get-FolderS3ObjectMeta -Bucket $Bucket -Key $Key -Backend $Backend `
        -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
        -RcloneLsJson $RcloneLsJson -SkipTags:$SkipTags
    return (ConvertTo-FolderDownloadMetaHashtable -Metadata $marker.Metadata)
}

function Get-FolderDownloadRootMeta {
    param([string]$Bucket, [string]$Backend, $AwsHeadObject, $AwsGetObjectTagging, $RcloneLsJson)
    # Bucket-root config lives on zero-byte marker _root/ (S3 has no empty-key metadata).
    return (Get-FolderDownloadMetaHashtable -Bucket $Bucket -Key '_root/' -Backend $Backend `
            -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
            -RcloneLsJson $RcloneLsJson)
}

function Test-FolderDownloadProviderEnabled {
    param([hashtable]$ProviderMeta)
    if (-not $ProviderMeta) { return $false }
    return ([string]$ProviderMeta['enabled']).Trim() -eq '1'
}

function Resolve-FolderDownloadDefaultAge {
    param(
        [hashtable]$AffiliateMeta,
        [hashtable]$ProviderMeta,
        [hashtable]$RootMeta
    )
    foreach ($src in @($AffiliateMeta, $ProviderMeta, $RootMeta)) {
        if (-not $src) { continue }
        $raw = [string]$src['defaultage']
        if ([string]::IsNullOrWhiteSpace($raw)) { continue }
        $n = 0
        if ([int]::TryParse($raw.Trim(), [ref]$n) -and $n -gt 0) { return $n }
    }
    throw 'needs_defaultage: set defaultage on s3://a-affiliates/_root/ (merchant > provider > root)'
}

function Test-FolderDownloadAffiliateDue {
    param([hashtable]$AffiliateMeta, [datetime]$Now, [int]$Days)
    if (-not $AffiliateMeta) { return $true }
    $raw = [string]$AffiliateMeta['lastdownload']
    if ([string]::IsNullOrWhiteSpace($raw)) { return $true }
    try {
        $dt = [datetime]::Parse([string]$raw, $null, [System.Globalization.DateTimeStyles]::RoundtripKind)
        if ($dt.Kind -eq [DateTimeKind]::Unspecified) {
            $dt = [DateTime]::SpecifyKind($dt, [DateTimeKind]::Utc)
        }
        else {
            $dt = $dt.ToUniversalTime()
        }
        return (($Now.ToUniversalTime() - $dt).TotalDays -ge $Days)
    }
    catch {
        return $true
    }
}

function Get-FolderDownloadProviderNames {
    param([string]$Bucket)
    $names = New-Object 'System.Collections.Generic.List[string]'
    $token = $null
    do {
        $awsArgs = @(
            's3api', 'list-objects-v2',
            '--bucket', $Bucket,
            '--delimiter', '/',
            '--output', 'json'
        )
        if ($token) { $awsArgs += @('--continuation-token', $token) }
        $raw = & aws @awsArgs 2>&1
        if ($LASTEXITCODE -ne 0) { throw ("list_providers_failed: {0}" -f $raw) }
        $text = if ($raw -is [Array]) { ($raw | ForEach-Object { "$_" }) -join "`n" } else { [string]$raw }
        $j = $text | ConvertFrom-Json
        foreach ($p in @($j.CommonPrefixes)) {
            $pref = [string]$p.Prefix
            if ($pref -match '^([a-z][a-z0-9-]*)/$') {
                $name = $Matches[1]
                if ($name.StartsWith('_') -or $name.StartsWith('.')) { continue }
                $names.Add($name)
            }
        }
        $token = $null
        $nctProp = $j.PSObject.Properties['NextContinuationToken']
        if ($nctProp -and $nctProp.Value) { $token = [string]$nctProp.Value }
    } while ($token)
    return @($names | Sort-Object -Unique)
}

function Get-FolderDownloadAffiliateLocations {
    param($ProviderLocation)
    $children = @()
    $dirs = Get-ChildItem -LiteralPath $ProviderLocation.Path -Directory -ErrorAction SilentlyContinue
    foreach ($d in @($dirs)) {
        if ($d.Name -notmatch '^\d+$') { continue }
        $childLoc = ConvertTo-FolderS3Location -Path $d.FullName -MountRoot $ProviderLocation.MountRoot
        if ($childLoc.Kind -eq 'affiliate') { $children += $childLoc }
    }
    return @($children)
}

function Get-FolderDownloadBatchMetaByKey {
    <#
    .SYNOPSIS
    Parallel head-object for many affiliate markers (selection / due-check).
    Returns hashtable keyed by S3 key -> metadata hashtable.
    #>
    param(
        [string]$Bucket,
        [string[]]$Keys,
        [string]$AwsProfile,
        [string]$NodeExe,
        [int]$Concurrency = 16
    )
    $out = @{}
    if (-not $Keys -or $Keys.Count -eq 0) { return $out }

    $node = Resolve-FolderDownloadNode -NodeExe $NodeExe
    $runner = Join-Path $here 'batch-folder-head-meta.js'
    $argsObj = [ordered]@{
        bucket      = $Bucket
        keys        = @($Keys)
        awsProfile  = $AwsProfile
        concurrency = $Concurrency
    }
    $jsonArgs = ($argsObj | ConvertTo-Json -Compress -Depth 6)
    $envName = 'A_SEARCH_BATCH_HEAD_ARGS'
    $prev = [Environment]::GetEnvironmentVariable($envName, 'Process')
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        [Environment]::SetEnvironmentVariable($envName, $jsonArgs, 'Process')
        $label = ("Batch head-object x{0}" -f $Keys.Count)
        $jobOut = Invoke-FolderToolWithSpinner -Label $label -ArgumentList @($node, $runner) -ScriptBlock {
            param($nodeExe, $js)
            $o = & $nodeExe $js '--args-env' 2>&1
            return @{ code = $LASTEXITCODE; out = (($o | ForEach-Object { "$_" }) -join "`n") }
        }
    }
    finally {
        $ErrorActionPreference = $prevEap
        if ($null -eq $prev) {
            [Environment]::SetEnvironmentVariable($envName, $null, 'Process')
        }
        else {
            [Environment]::SetEnvironmentVariable($envName, $prev, 'Process')
        }
    }
    $code = [int]$jobOut.code
    $text = [string]$jobOut.out
    $line = ($text -split "`n" | Where-Object { $_.Trim().StartsWith('{') } | Select-Object -Last 1)
    if (-not $line) {
        throw ("batch_head_failed: node exit {0}: {1}" -f $code, $text.Trim())
    }
    $parsed = ConvertFrom-FolderS3Json $line
    if (-not $parsed -or -not $parsed.ok) {
        $err = if ($parsed) { [string]$parsed.error } else { 'parse_failed' }
        throw ("batch_head_failed: {0}" -f $err)
    }
    foreach ($r in @($parsed.results)) {
        if (-not $r -or -not $r.key) { continue }
        $meta = @{}
        if ($r.metadata) {
            foreach ($p in $r.metadata.PSObject.Properties) {
                $meta[[string]$p.Name] = [string]$p.Value
            }
        }
        $out[[string]$r.key] = $meta
    }
    return $out
}

function Test-FolderDownloadFeedOk {
    param($Feed)
    if ($null -eq $Feed) { return $false }
    $ok = Get-FolderDownloadResultProp $Feed 'ok'
    $st = [string](Get-FolderDownloadResultProp $Feed 'status')
    if ($ok) { return $true }
    if ($st -in @('exists', 'parts_exists', 'skipped_nofeed', 'dry_run')) { return $true }
    return $false
}

function Test-FolderDownloadCouponsOk {
    param($Coupons)
    if ($null -eq $Coupons) { return $false }
    $ok = Get-FolderDownloadResultProp $Coupons 'ok'
    $st = [string](Get-FolderDownloadResultProp $Coupons 'status')
    if ($ok) { return $true }
    if ($st -in @('exists', 'dry_run', 'skipped_provider')) { return $true }
    return $false
}

function Write-FolderDownloadSummary {
    param($Bundle, [string]$Provider, [string]$AffiliateId)
    $feed = $null
    $coupons = $null
    if ($Bundle -and ($Bundle.PSObject.Properties.Name -contains 'feed')) {
        $feed = $Bundle.feed
        $coupons = $Bundle.coupons
        if ($Bundle.provider) { $Provider = [string]$Bundle.provider }
        if ($Bundle.affiliateId) { $AffiliateId = [string]$Bundle.affiliateId }
    }
    else {
        $feed = $Bundle
    }

    $p = Get-FolderDownloadResultProp $feed 'provider'
    if (-not $p) { $p = $Provider }
    $a = Get-FolderDownloadResultProp $feed 'affiliateId'
    if (-not $a) { $a = $AffiliateId }
    $status = [string](Get-FolderDownloadResultProp $feed 'status')
    $size = Get-FolderDownloadResultProp $feed 'size'
    $dated = [string](Get-FolderDownloadResultProp $feed 'datedKey')
    $key = [string](Get-FolderDownloadResultProp $feed 'key')
    if ([string]::IsNullOrEmpty($key)) { $key = $dated }
    $feedSet = Get-FolderDownloadResultProp $feed 'feedurlSet'
    $feedFlag = 'n/a'
    if ($null -ne $feedSet) {
        $feedFlag = if ($feedSet) { '***set***' } else { '(missing)' }
    }
    $cStatus = if ($coupons) { [string](Get-FolderDownloadResultProp $coupons 'status') } else { 'n/a' }
    $cCount = if ($coupons) { Get-FolderDownloadResultProp $coupons 'count' } else { $null }
    $cKey = if ($coupons) { [string](Get-FolderDownloadResultProp $coupons 'key') } else { '' }

    if ($status -eq 'dry_run') {
        $fmt = Get-FolderDownloadResultProp $feed 'format'
        $comp = Get-FolderDownloadResultProp $feed 'compression'
        Write-Output ("dry_run provider={0} affiliateid={1} feedurl={2} format={3} compression={4} feedKey={5} coupons={6}" -f `
                $p, $a, $feedFlag, $fmt, $comp, $key, $cStatus)
        return
    }
    Write-Output ("provider={0} affiliateid={1} feed={2} size={3} feedKey={4} coupons={5} couponCount={6} couponKey={7}" -f `
            $p, $a, $status, $size, $key, $cStatus, $cCount, $cKey)
}

try {
    $target = if ($Path) { $Path } else { (Get-Location).Path }
    $loc = ConvertTo-FolderS3Location -Path $target -MountRoot $MountRoot

    if ($loc.Bucket.ToLowerInvariant() -ne 'a-affiliates') {
        [Console]::Error.WriteLine("not_a_affiliates: Invoke-FolderDownload only works under a-affiliates (got bucket=$($loc.Bucket) kind=$($loc.Kind))")
        exit 3
    }

    if ($loc.Kind -eq 'affiliate-child') {
        [Console]::Error.WriteLine("not_affiliate: kind=$($loc.Kind); cd to the affiliate folder (not parts/)")
        exit 3
    }
    if ($loc.Kind -notin @('a-affiliates-root', 'provider', 'affiliate')) {
        [Console]::Error.WriteLine("not_affiliate: kind=$($loc.Kind); run at a-affiliates root, provider, or affiliate folder")
        exit 3
    }

    $profile = Resolve-FolderDownloadAwsProfile -AwsProfile $AwsProfile
    $prevAwsProfile = [Environment]::GetEnvironmentVariable('AWS_PROFILE', 'Process')
    [Environment]::SetEnvironmentVariable('AWS_PROFILE', $profile, 'Process')
    try {
        $failures = 0
        $results = @()
        $failedIds = @()
        $now = [datetime]::UtcNow

        if ($loc.Kind -eq 'affiliate') {
            $r = Invoke-FolderDownloadOneAffiliate -Location $loc -Force:$Force -DryRun:$DryRun `
                -Backend $Backend -AwsProfile $profile -NodeExe $NodeExe `
                -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
                -RcloneLsJson $RcloneLsJson -InvokeDownload $InvokeDownload
            $results += $r
            $parts = @($loc.Key.TrimEnd('/').Split('/'))
            Write-FolderDownloadSummary -Bundle $r -Provider $parts[0] -AffiliateId $parts[1]
            $feedOk = Test-FolderDownloadFeedOk -Feed $r.feed
            $coupOk = Test-FolderDownloadCouponsOk -Coupons $r.coupons
            if (-not $feedOk) { $failures += 1 }
            if (-not $coupOk) { $failures += 1 }
            Write-FolderToolStep ("Download finished feedOk={0} couponsOk={1}" -f $feedOk, $coupOk)
            if ($failures -gt 0) { exit 1 }
            exit 0
        }

        Write-FolderToolStep 'Loading root defaultage from _root/'
        $rootMeta = Get-FolderDownloadRootMeta -Bucket $loc.Bucket -Backend $Backend `
            -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
            -RcloneLsJson $RcloneLsJson

        $providerLocs = @()
        if ($loc.Kind -eq 'a-affiliates-root') {
            Write-FolderToolStep 'Listing providers under a-affiliates/'
            $providerNames = @(Get-FolderDownloadProviderNames -Bucket $loc.Bucket)
            foreach ($pn in $providerNames) {
                $pPath = Join-Path $loc.Path $pn
                if (-not (Test-Path -LiteralPath $pPath)) { continue }
                $providerLocs += (ConvertTo-FolderS3Location -Path $pPath -MountRoot $loc.MountRoot)
            }
        }
        else {
            $providerLocs = @($loc)
        }

        $targets = @()
        $skippedFresh = 0
        $skippedDisabledProviders = 0
        $skippedDisabledMerchants = 0
        $providersEnabled = 0

        foreach ($ploc in $providerLocs) {
            $pname = $ploc.KeyParts[0]
            Write-FolderToolStep ("Reading provider marker {0}/" -f $pname)
            $pmeta = Get-FolderDownloadMetaHashtable -Bucket $ploc.Bucket -Key $ploc.Key -Backend $Backend `
                -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
                -RcloneLsJson $RcloneLsJson
            if (-not (Test-FolderDownloadProviderEnabled -ProviderMeta $pmeta)) {
                $skippedDisabledProviders += 1
                Write-FolderToolDetail ("provider {0} enabled=0 - skip" -f $pname)
                if ($loc.Kind -eq 'provider') {
                    [Console]::Error.WriteLine(("provider_disabled: {0} has enabled!=1" -f $pname))
                    exit 3
                }
                continue
            }
            $providersEnabled += 1

            $children = @()
            if ($ListAffiliateChildren -and $loc.Kind -eq 'provider') {
                $children = @(& $ListAffiliateChildren $ploc)
            }
            else {
                $children = @(Get-FolderDownloadAffiliateLocations -ProviderLocation $ploc)
            }
            Write-FolderToolDetail ("provider {0} merchants={1}" -f $pname, $children.Count)
            Write-FolderToolStep ("Scanning {0} merchants for due downloads (parallel head-object)..." -f $pname)

            $provDue = 0
            $provDisabled = 0
            $provFresh = 0
            $keys = @($children | ForEach-Object { $_.Key })
            $metaByKey = $null
            if ($AwsHeadObject) {
                # Test/mock path: sequential head via injected scriptblock (SkipTags).
                $metaByKey = @{}
                $i = 0
                foreach ($c in $children) {
                    $i += 1
                    $metaByKey[$c.Key] = Get-FolderDownloadMetaHashtable -Bucket $c.Bucket -Key $c.Key -Backend $Backend `
                        -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
                        -RcloneLsJson $RcloneLsJson -SkipTags
                    if (($i % 25 -eq 0) -or ($i -eq $children.Count)) {
                        Write-FolderToolDetail ("scan {0}: {1}/{2}" -f $pname, $i, $children.Count)
                    }
                }
            }
            else {
                $metaByKey = Get-FolderDownloadBatchMetaByKey -Bucket $ploc.Bucket -Keys $keys `
                    -AwsProfile $profile -NodeExe $NodeExe -Concurrency 16
            }

            foreach ($c in $children) {
                $aid = $c.KeyParts[1]
                $ameta = $metaByKey[$c.Key]
                if (-not $ameta) { $ameta = @{} }
                if (([string]$ameta['enabled']).Trim() -ne '1') {
                    $skippedDisabledMerchants += 1
                    $provDisabled += 1
                    continue
                }
                $ageDays = Resolve-FolderDownloadDefaultAge -AffiliateMeta $ameta -ProviderMeta $pmeta -RootMeta $rootMeta
                if (-not $All) {
                    if (-not (Test-FolderDownloadAffiliateDue -AffiliateMeta $ameta -Now $now -Days $ageDays)) {
                        $skippedFresh += 1
                        $provFresh += 1
                        continue
                    }
                }
                $provDue += 1
                $targets += [pscustomobject]@{
                    Location     = $c
                    Provider     = $pname
                    AffiliateId  = $aid
                    DefaultAge   = $ageDays
                }
            }
            Write-FolderToolDetail ("scan {0} done: due={1} disabled={2} fresh={3}" -f `
                    $pname, $provDue, $provDisabled, $provFresh)
        }

        Write-FolderToolStep ("Selection providersEnabled={0} dueMerchants={1} skippedFresh={2} skippedDisabledProviders={3} skippedDisabledMerchants={4} all={5}" -f `
                $providersEnabled, $targets.Count, $skippedFresh, $skippedDisabledProviders, $skippedDisabledMerchants, [bool]$All)

        if ($providersEnabled -eq 0 -and $loc.Kind -eq 'a-affiliates-root') {
            Write-Output 'no_enabled_providers'
            exit 0
        }
        if (-not $targets.Count) {
            Write-Output 'no_due_merchants'
            exit 0
        }

        foreach ($t in $targets) {
            try {
                Write-FolderToolStep ("Due {0}/{1} (defaultage={2})" -f $t.Provider, $t.AffiliateId, $t.DefaultAge)
                $r = Invoke-FolderDownloadOneAffiliate -Location $t.Location -Force:$Force -DryRun:$DryRun `
                    -Backend $Backend -AwsProfile $profile -NodeExe $NodeExe `
                    -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
                    -RcloneLsJson $RcloneLsJson -InvokeDownload $InvokeDownload
                $results += $r
                Write-FolderDownloadSummary -Bundle $r -Provider $t.Provider -AffiliateId $t.AffiliateId
                $feedOk = Test-FolderDownloadFeedOk -Feed $r.feed
                $coupOk = Test-FolderDownloadCouponsOk -Coupons $r.coupons
                if (-not $feedOk -or -not $coupOk) {
                    $failures += 1
                    $failedIds += ('{0}/{1}' -f $t.Provider, $t.AffiliateId)
                }
            }
            catch {
                $failures += 1
                $failedIds += ('{0}/{1}' -f $t.Provider, $t.AffiliateId)
                $safe = $_.Exception.Message -replace '(?i)(api[_-]?key|token|password|secret|feedurl)\s*[:=]\s*\S+', '$1=***'
                Write-FolderToolDetail ("FAILED {0}/{1}: {2}" -f $t.Provider, $t.AffiliateId, $safe)
                Write-Output ("provider={0} affiliateid={1} status=error error={2}" -f $t.Provider, $t.AffiliateId, $safe)
            }
        }

        Write-Output ("summary ok={0} failed={1} selected={2} skippedFresh={3}" -f `
                (@($results).Count - $failures), $failures, $targets.Count, $skippedFresh)
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
    if ($safe -match '^needs_defaultage') {
        exit 5
    }
    exit 1
}
