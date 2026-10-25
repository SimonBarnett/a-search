<#
.SYNOPSIS
Import dated affiliate feeds into a_search (walrus\asearch).

.DESCRIPTION
Reads provider instructions from {provider}/_import/ (config.json + IMPORT.md).
Upserts Parts and AffiliateOffers; soft-deletes rows missing from the batch;
deletes imported dated files on success.

.PARAMETER Path
a-affiliates root, provider, or merchant folder (default: cwd).

.PARAMETER DryRun
Alias -WhatIf. Parse and safety-check only; no SQL writes, no deletes.
#>
[CmdletBinding()]
param(
    [Alias('LiteralPath')][string]$Path,
    [string]$MountRoot,
    [string]$MerchantId,
    [switch]$Force,
    [switch]$WhatIf,
    [Alias('DryRun')][switch]$DryRunSwitch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$DryRun = $WhatIf -or $DryRunSwitch

$here = $PSScriptRoot
. (Join-Path $here 'FolderS3.ps1')
. (Join-Path $here 'FolderProgress.ps1')
. (Join-Path $here 'DbImportSql.ps1')

function Get-DbImportProviderNames {
    param([string]$Bucket)
    $names = New-Object 'System.Collections.Generic.List[string]'
    $token = $null
    do {
        $awsArgs = @('s3api', 'list-objects-v2', '--bucket', $Bucket, '--delimiter', '/', '--output', 'json')
        if ($token) { $awsArgs += @('--continuation-token', $token) }
        $raw = & aws @awsArgs 2>&1
        if ($LASTEXITCODE -ne 0) { throw ("list_providers_failed: {0}" -f $raw) }
        $j = ConvertFrom-FolderS3Json $raw
        foreach ($p in @($j.CommonPrefixes)) {
            $pref = [string]$p.Prefix
            if ($pref -match '^([a-z][a-z0-9-]*)/$') {
                $name = $Matches[1]
                if ($name.StartsWith('_') -or $name.StartsWith('.')) { continue }
                $names.Add($name)
            }
        }
        $token = $null
        $nct = $j.PSObject.Properties['NextContinuationToken']
        if ($nct -and $nct.Value) { $token = [string]$nct.Value }
    } while ($token)
    return @($names | Sort-Object -Unique)
}

function Get-DbImportProviderEnabled {
    param([string]$Bucket, [string]$Provider)
    $marker = Get-FolderS3ObjectMeta -Bucket $Bucket -Key ("{0}/" -f $Provider) -Backend aws -SkipTags
    $en = ''
    if ($marker -and $marker.Metadata -and $marker.Metadata['enabled']) {
        $en = [string]$marker.Metadata['enabled']
    }
    return ($en.Trim() -eq '1')
}

function Read-DbImportConfig {
    param([string]$ImportRoot)
    $cfgPath = Join-Path $ImportRoot 'config.json'
    if (-not (Test-Path -LiteralPath $cfgPath)) {
        throw ("import_config_missing: {0}" -f $cfgPath)
    }
    return (Get-Content -LiteralPath $cfgPath -Raw | ConvertFrom-Json)
}

function Get-DbImportMerchantDirs {
    param([string]$ProviderPath, [string]$OnlyId)
    $dirs = Get-ChildItem -LiteralPath $ProviderPath -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^\d+$' }
    if ($OnlyId) { $dirs = @($dirs | Where-Object { $_.Name -eq $OnlyId }) }
    return @($dirs)
}

function Find-DbImportDatedFile {
    param([string]$MerchantPath, [string]$Pattern)
    $files = @(Get-ChildItem -LiteralPath $MerchantPath -File -Filter $Pattern -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}\.' } |
            Sort-Object Name -Descending)
    if ($files.Count -eq 0) { return $null }
    return $files[0]
}

function Invoke-DbImportParseNode {
    param([string]$Mode, [string]$InFile, [string]$OutFile, [string]$NodeExe)
    $node = if ($NodeExe -and (Test-Path $NodeExe)) { $NodeExe } else { 'node' }
    $cli = Join-Path $here 'dbimport\parse-cli.js'
    $flag = if ($Mode -eq 'coupons') { '--coupons' } else { '--parts' }
    $out = & $node $cli $flag $InFile '--out' $OutFile 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ("parse_failed: {0}" -f ($out | Out-String))
    }
    $line = ($out | Where-Object { "$_".Trim().StartsWith('{') } | Select-Object -Last 1)
    return ($line | ConvertFrom-Json)
}

function Remove-DbImportS3Object {
    param([string]$Bucket, [string]$Key)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & aws s3api delete-object --bucket $Bucket --key $Key 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            # fallback mount delete
            $mount = if ($env:A_SEARCH_S3_MOUNT) { $env:A_SEARCH_S3_MOUNT.TrimEnd('\') } else { 'S:' }
            $local = Join-Path $mount ($Bucket + '\' + ($Key -replace '/', '\'))
            if (Test-Path -LiteralPath $local) { Remove-Item -LiteralPath $local -Force }
        }
    }
    finally { $ErrorActionPreference = $prev }
}

function Import-DbImportOneMerchant {
    param(
        [string]$Provider,
        [string]$AffiliateId,
        [string]$MerchantPath,
        $Config,
        [string]$Bucket,
        [System.Data.SqlClient.SqlConnection]$Connection,
        [bool]$DryRun,
        [string]$NodeExe
    )
    $tmp = Join-Path $env:TEMP ("dbimport-{0}-{1}" -f $Provider, $AffiliateId)
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    try {
        $csv = Find-DbImportDatedFile -MerchantPath $MerchantPath -Pattern '*.csv'
        $coupons = Find-DbImportDatedFile -MerchantPath $MerchantPath -Pattern '*.coupons.json'
        if (-not $csv -and -not $coupons) {
            Write-FolderToolDetail ("{0}/{1}: no dated csv/coupons - skip" -f $Provider, $AffiliateId)
            return [pscustomobject]@{
                provider    = $Provider
                affiliateId = $AffiliateId
                status      = 'no_files'
                parts       = $null
                offers      = $null
                dryRun      = $DryRun
            }
        }

        $envName = if ($Config.env) { [string]$Config.env } else { 'live' }
        $maxRatio = if ($null -ne $Config.maxRemoveRatio) { [double]$Config.maxRemoveRatio } else { 0.5 }
        $partsResult = $null
        $offersResult = $null

        if ($csv) {
            Write-FolderToolStep ("Parse parts {0}/{1} ({2})" -f $Provider, $AffiliateId, $csv.Name)
            $partsJson = Join-Path $tmp 'parts.json'
            $parsed = Invoke-FolderToolWithSpinner -Label ("Parse CSV {0}" -f $csv.Name) -ArgumentList @(
                $here, $csv.FullName, $partsJson
            ) -ScriptBlock {
                param($tools, $inFile, $outFile)
                $cli = Join-Path $tools 'dbimport\parse-cli.js'
                & node $cli --parts $inFile --out $outFile 2>&1
                if ($LASTEXITCODE -ne 0) { throw "parse_parts_failed" }
                return $true
            }
            # parse-cli writes UTF-8 NDJSON; WinPS 5.1 Get-Content defaults to ANSI and
            # turns multi-byte chars (e.g. £) into two chars, blowing nvarchar limits.
            $rows = @(Get-Content -LiteralPath $partsJson -Encoding UTF8 | Where-Object { $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json })
            Write-FolderToolDetail ("parts rows={0}" -f $rows.Count)
            $partsResult = Import-DbImportPartsRows -Connection $Connection -Source $Provider `
                -FeedKey $AffiliateId -Env $envName -Rows $rows -MaxRemoveRatio $maxRatio -DryRun:$DryRun
            if (-not $DryRun -and $Config.deleteAfterImport -ne $false) {
                $key = "{0}/{1}/{2}" -f $Provider, $AffiliateId, $csv.Name
                Remove-DbImportS3Object -Bucket $Bucket -Key $key
                Write-FolderToolDetail ("deleted s3://{0}/{1}" -f $Bucket, $key)
            }
        }

        if ($coupons) {
            Write-FolderToolStep ("Parse coupons {0}/{1} ({2})" -f $Provider, $AffiliateId, $coupons.Name)
            $offersJson = Join-Path $tmp 'offers.json'
            Invoke-FolderToolWithSpinner -Label ("Parse coupons {0}" -f $coupons.Name) -ArgumentList @(
                $here, $coupons.FullName, $offersJson
            ) -ScriptBlock {
                param($tools, $inFile, $outFile)
                $cli = Join-Path $tools 'dbimport\parse-cli.js'
                & node $cli --coupons $inFile --out $outFile 2>&1
                if ($LASTEXITCODE -ne 0) { throw "parse_coupons_failed" }
                return $true
            } | Out-Null
            $offers = @()
            if ((Get-Item -LiteralPath $offersJson).Length -gt 0) {
                $offers = @(Get-Content -LiteralPath $offersJson -Encoding UTF8 | Where-Object { $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json })
            }
            # empty offers list is allowed - clears active offers for feed
            Write-FolderToolDetail ("offers rows={0}" -f $offers.Count)
            $offersResult = Import-DbImportOfferRows -Connection $Connection -Source $Provider `
                -FeedKey $AffiliateId -Env $envName -Rows $offers -DryRun:$DryRun
            if (-not $DryRun -and $Config.deleteAfterImport -ne $false) {
                $key = "{0}/{1}/{2}" -f $Provider, $AffiliateId, $coupons.Name
                Remove-DbImportS3Object -Bucket $Bucket -Key $key
                Write-FolderToolDetail ("deleted s3://{0}/{1}" -f $Bucket, $key)
            }
        }

        return [pscustomobject]@{
            provider    = $Provider
            affiliateId = $AffiliateId
            status      = 'ok'
            parts       = $partsResult
            offers      = $offersResult
            dryRun      = $DryRun
        }
    }
    finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

try {
    $target = if ($Path) { $Path } else { (Get-Location).Path }
    $loc = ConvertTo-FolderS3Location -Path $target -MountRoot $MountRoot
    if ($loc.Bucket.ToLowerInvariant() -ne 'a-affiliates') {
        [Console]::Error.WriteLine(("not_a_affiliates: got bucket={0}" -f $loc.Bucket))
        exit 3
    }
    if ($loc.Kind -notin @('a-affiliates-root', 'provider', 'affiliate')) {
        [Console]::Error.WriteLine(("dbimport_cwd: use root, provider, or merchant folder (got kind={0})" -f $loc.Kind))
        exit 3
    }

    $jobs = @()
    if ($loc.Kind -eq 'affiliate') {
        $jobs += [pscustomobject]@{ Provider = $loc.KeyParts[0]; AffiliateId = $loc.KeyParts[1]; Path = $loc.Path }
    }
    elseif ($loc.Kind -eq 'provider') {
        $pname = $loc.KeyParts[0]
        if (-not (Get-DbImportProviderEnabled -Bucket $loc.Bucket -Provider $pname)) {
            [Console]::Error.WriteLine(("provider_disabled: {0}" -f $pname))
            exit 3
        }
        $importRoot = Join-Path $loc.Path '_import'
        if (-not (Test-Path -LiteralPath $importRoot)) {
            [Console]::Error.WriteLine(("import_not_implemented: {0} missing _import/" -f $pname))
            exit 4
        }
        foreach ($d in Get-DbImportMerchantDirs -ProviderPath $loc.Path -OnlyId $MerchantId) {
            $jobs += [pscustomobject]@{ Provider = $pname; AffiliateId = $d.Name; Path = $d.FullName }
        }
    }
    else {
        # root
        foreach ($pn in Get-DbImportProviderNames -Bucket $loc.Bucket) {
            if (-not (Get-DbImportProviderEnabled -Bucket $loc.Bucket -Provider $pn)) {
                Write-FolderToolDetail ("provider {0} enabled=0 - skip" -f $pn)
                continue
            }
            $pPath = Join-Path $loc.Path $pn
            $importRoot = Join-Path $pPath '_import'
            if (-not (Test-Path -LiteralPath $importRoot)) {
                [Console]::Error.WriteLine(("import_not_implemented: {0} is enabled=1 but missing _import/" -f $pn))
                exit 4
            }
            foreach ($d in Get-DbImportMerchantDirs -ProviderPath $pPath -OnlyId $MerchantId) {
                $jobs += [pscustomobject]@{ Provider = $pn; AffiliateId = $d.Name; Path = $d.FullName }
            }
        }
    }

    if ($jobs.Count -eq 0) {
        Write-Output 'no_merchants'
        exit 0
    }

    # Load config from first job's provider _import
    $provPath = Join-Path $loc.MountRoot ("a-affiliates\" + $jobs[0].Provider)
    if ($loc.Kind -eq 'provider') { $provPath = $loc.Path }
    elseif ($loc.Kind -eq 'affiliate') { $provPath = Split-Path -Parent $loc.Path }
    else { $provPath = Join-Path $loc.Path $jobs[0].Provider }
    $cfg = Read-DbImportConfig -ImportRoot (Join-Path $provPath '_import')
    $server = if ($cfg.server) { [string]$cfg.server } else { 'walrus\asearch' }
    $envDb = if ($env:MSSQL_DATABASE) { [string]$env:MSSQL_DATABASE.Trim() } else { '' }
    $cfgDb = if ($cfg.database) { [string]$cfg.database.Trim() } else { '' }
    $database = if ($envDb) { $envDb } elseif ($cfgDb) { $cfgDb } else { '' }
    if (-not $database) {
        throw 'needs_mssql_database: set MSSQL_DATABASE or _import/config.json database (no silent a_search default)'
    }

    Write-FolderToolStep ("dbimport merchants={0} server={1} db={2} dryRun={3}" -f $jobs.Count, $server, $database, $DryRun)
    $conn = New-DbImportConnection -Server $server -Database $database
    $ok = 0; $fail = 0
    try {
        foreach ($j in $jobs) {
            try {
                $r = Import-DbImportOneMerchant -Provider $j.Provider -AffiliateId $j.AffiliateId `
                    -MerchantPath $j.Path -Config $cfg -Bucket $loc.Bucket -Connection $conn `
                    -DryRun:$DryRun -NodeExe $null
                $ok++
                $pc = 0; $oc = 0; $pd = 0
                if ($r.PSObject.Properties['parts'] -and $null -ne $r.parts) {
                    if ($r.parts.PSObject.Properties['parsed']) { $pc = [int]$r.parts.parsed }
                    if ($r.parts.PSObject.Properties['deleted']) { $pd = [int]$r.parts.deleted }
                }
                if ($r.PSObject.Properties['offers'] -and $null -ne $r.offers) {
                    if ($r.offers.PSObject.Properties['parsed']) { $oc = [int]$r.offers.parsed }
                }
                Write-Output ("provider={0} affiliateid={1} status={2} parts={3} offers={4} partsDeleted={5}" -f `
                        $r.provider, $r.affiliateId, $r.status, $pc, $oc, $pd)
            }
            catch {
                $fail++
                $safe = $_.Exception.Message -replace '(?i)(password|secret|token)\s*[:=]\s*\S+', '$1=***'
                Write-FolderToolDetail ("FAILED {0}/{1}: {2}" -f $j.Provider, $j.AffiliateId, $safe)
                Write-Output ("provider={0} affiliateid={1} status=error error={2}" -f $j.Provider, $j.AffiliateId, $safe)
            }
        }
    }
    finally {
        $conn.Close()
    }
    Write-Output ("summary ok={0} failed={1} selected={2}" -f $ok, $fail, $jobs.Count)
    if ($fail -gt 0) { exit 1 }
    exit 0
}
catch {
    $safe = $_.Exception.Message -replace '(?i)(password|secret|token)\s*[:=]\s*\S+', '$1=***'
    [Console]::Error.WriteLine($safe)
    exit 1
}
