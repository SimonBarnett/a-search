<#
.SYNOPSIS
Onboard new affiliate signups for a provider folder under a-affiliates.

.DESCRIPTION
Reads provider marker metadata (e.g. S:\a-affiliates\awin), discovers newly
joined advertisers that have no awin/{id}/ folder yet, creates/merges each
folder marker (logourl is REQUIRED: Publisher programmes API logoUrl when
present, else the public Awin profile CDN URL; backfills when missing —
URL only, no image bytes), then runs download for each created folder.

Awin (no MFA): uses the product-data Feed List
(feedlisturl + feedapikey from the provider marker), same family of credentials
as madeira-awin-clubscan's publisher product-feeds API. Optional Bearer token
from provider apitoken or C:\passwords\awin.apitoken.txt can list joined
programmes for no-feed follow-up. Does not use the UI login or OTP.

.PARAMETER Path
Provider folder under the S3 mount (default: cwd). Example: S:\a-affiliates\awin

.PARAMETER WhatIf
Dry run: list would-create ids; no S3 writes; no download.

.PARAMETER SkipDownload
Create folders only; do not invoke download.

.PARAMETER Max
Cap how many new folders to create this run (default: unlimited).

.PARAMETER ForceDownload
Pass -Force through to download for each new folder.

.PARAMETER SkipDeleteInactive
Do not delete folders for advertisers the Publisher API reports as not joined.

Delete only when apitoken programmes?relationship=joined is available and the
id is absent from that joined set (left the programme). Missing from the Feed
List alone is NOT grounds for delete — many joined advertisers have no product
feed but still offer discount coupons. Use -SkipDeleteInactive to leave all
folders alone.

.PARAMETER BackfillLogourl
One-shot: HEAD active folders and set logourl where missing. Default off —
new folders get logourl on create, and folders that already have it are never
re-checked. Do not use this on every daily run.
#>
[CmdletBinding()]
param(
    [Alias('LiteralPath')][string]$Path,
    [string]$MountRoot,
    [switch]$WhatIf,
    [Alias('DryRun')][switch]$DryRunSwitch,
    [switch]$SkipDownload,
    [switch]$ForceDownload,
    [Alias('SkipDisableInactive')][switch]$SkipDeleteInactive,
    [switch]$BackfillLogourl,
    [int]$Max = 0,
    [ValidateSet('auto', 'aws', 'rclone')][string]$Backend = 'auto',
    [string]$AwsProfile,
    [string]$PasswordsDir,
    [string]$ReportDir
)

$DryRun = $WhatIf -or $DryRunSwitch
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
. (Join-Path $here 'FolderS3.ps1')
. (Join-Path $here 'FolderProgress.ps1')
. (Join-Path $here 'ToolFailure.ps1')

# Progress goes to the host (not the success JSON pipeline). Spinner chars: / | \ -
$script:OnboardSpinChars = @('/', '|', '\', '-')

function Write-OnboardStep {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-FolderToolStep -Message $Message
}

function Write-OnboardDetail {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-FolderToolDetail -Message $Message
}

function Clear-OnboardSpinnerLine {
    Write-Host ("`r" + (' ' * 90) + "`r") -NoNewline
}

function Invoke-OnboardWithSpinner {
    # FR #5151: use shared FolderProgress spinner (stderr steps + real job failure text).
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][scriptblock]$ScriptBlock,
        [object[]]$ArgumentList = @()
    )
    Invoke-FolderToolWithSpinner -Label $Label -ScriptBlock $ScriptBlock -ArgumentList $ArgumentList
}


function Resolve-OnboardAwsProfile {
    # FR #5169: shared resolver (annotator default; ignore agents env).
    param([string]$AwsProfile, $Config)
    return (Resolve-FolderToolsAwsProfile -AwsProfile $AwsProfile -Config $Config)
}

function Get-OnboardPasswordsDir {
    param([string]$PasswordsDir)
    if ($PasswordsDir -and (Test-Path -LiteralPath $PasswordsDir)) { return $PasswordsDir }
    if ($env:A_SEARCH_PASSWORDS_DIR -and (Test-Path -LiteralPath $env:A_SEARCH_PASSWORDS_DIR)) {
        return $env:A_SEARCH_PASSWORDS_DIR
    }
    if (Test-Path -LiteralPath 'C:\passwords') { return 'C:\passwords' }
    return $null
}

function Read-OptionalSecretFile {
    param([string]$FilePath)
    if (-not $FilePath -or -not (Test-Path -LiteralPath $FilePath)) { return $null }
    $lines = @(Get-Content -LiteralPath $FilePath -ErrorAction Stop)
    if ($lines.Count -lt 1) { return $null }
    $v = [string]$lines[0]
    if ($v) { $v = $v.Trim() }
    if ([string]::IsNullOrWhiteSpace($v)) { return $null }
    return $v
}

function Normalize-OnboardLogourl {
    <#
    .SYNOPSIS
    Normalize a logo URL for affiliate meta key logourl (ASCII https only).
    #>
    param([string]$Url)
    if ([string]::IsNullOrWhiteSpace($Url)) { return '' }
    $u = $Url.Trim()
    if ($u -notmatch '^https?://') { return '' }
    if ($u -match '[^\x00-\x7F]') { return '' }
    if ($u.StartsWith('http://', [System.StringComparison]::OrdinalIgnoreCase)) {
        $u = 'https://' + $u.Substring(7)
    }
    return $u
}

function Get-OnboardLogourl {
    <#
    .SYNOPSIS
    logourl is REQUIRED on every affiliate folder.
    Prefer Publisher API logoUrl when present; else the public Awin profile image
    https://ui.awin.com/images/upload/merchant/profile/{id}.png (no MFA; HEAD 200 for joined merchants).
    #>
    param(
        [Parameter(Mandatory = $true)][string]$AdvertiserId,
        [string]$ApiLogoUrl
    )
    $fromApi = Normalize-OnboardLogourl -Url $ApiLogoUrl
    if ($fromApi) { return $fromApi }
    return ("https://ui.awin.com/images/upload/merchant/profile/{0}.png" -f $AdvertiserId)
}

function Remove-OnboardAffiliatePrefix {
    <#
    .SYNOPSIS
    Delete an affiliate folder prefix (marker + dated feeds). Never used for active feeds.
    #>
    param(
        [string]$Bucket,
        [string]$Provider,
        [string]$AffiliateId,
        [bool]$DryRun,
        [string]$AwsProfile
    )
    $prefix = "s3://{0}/{1}/{2}/" -f $Bucket, $Provider, $AffiliateId
    if ($DryRun) {
        return [pscustomobject]@{ Action = 'would_delete'; Prefix = $prefix }
    }
    # FR #5176: always pass --profile (never ambient AWS_PROFILE alone).
    $cliProfile = Resolve-FolderS3CliProfile -AwsProfile $AwsProfile
    $awsArgs = @('--profile', $cliProfile, 's3', 'rm', $prefix, '--recursive')
    $out = & aws @awsArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ("delete_failed: {0} {1}" -f $prefix, ($out | Out-String))
    }
    return [pscustomobject]@{ Action = 'deleted'; Prefix = $prefix }
}

function Get-ProviderMetaRaw {
    param($Location, [string]$Backend, [string]$AwsProfile)
    # FR #5176: pass -AwsProfile into FolderS3 head.
    $marker = Get-FolderS3ObjectMeta -Bucket $Location.Bucket -Key $Location.Key -Backend $Backend -AwsProfile $AwsProfile
    $h = @{}
    if ($marker -and $marker.Metadata) {
        foreach ($k in $marker.Metadata.Keys) {
            $h[[string]$k] = [string]$marker.Metadata[$k]
        }
    }
    return $h
}

function Get-ExistingAffiliateIds {
    param([string]$Bucket, [string]$Provider, [string]$AwsProfile)
    $prefix = "$Provider/"
    Write-OnboardStep ("Listing existing {0}/{{id}}/ folders in s3://{1}" -f $Provider, $Bucket)
    # FR #5176: Resolve-FolderS3CliProfile so list argv always has --profile.
    $cliProfile = Resolve-FolderS3CliProfile -AwsProfile $AwsProfile
    # Entire list in a job with spinner (aws CLI pagination inside)
    $idList = Invoke-OnboardWithSpinner -Label ("Listing existing {0} folders" -f $Provider) -ArgumentList @($Bucket, $prefix, $Provider, $cliProfile) -ScriptBlock {
        param($Bucket, $prefix, $Provider, $cliProfile)
        $ids = New-Object 'System.Collections.Generic.List[string]'
        $token = $null
        do {
            $awsArgs = @(
                '--profile', $cliProfile, 's3api', 'list-objects-v2',
                '--bucket', $Bucket,
                '--prefix', $prefix,
                '--delimiter', '/',
                '--output', 'json'
            )
            if ($token) { $awsArgs += @('--continuation-token', $token) }
            $raw = & aws @awsArgs 2>&1
            if ($LASTEXITCODE -ne 0) { throw "list_affiliates_failed: $raw" }
            $text = if ($raw -is [Array]) { ($raw | ForEach-Object { "$_" }) -join "`n" } else { [string]$raw }
            $j = $text | ConvertFrom-Json
            foreach ($p in @($j.CommonPrefixes)) {
                $pref = [string]$p.Prefix
                if ($pref -match ('^{0}/(\d+)/$' -f [regex]::Escape($Provider))) {
                    $ids.Add($Matches[1])
                }
            }
            $token = $null
            if ($j.NextContinuationToken) { $token = [string]$j.NextContinuationToken }
        } while ($token)
        return @($ids)
    }
    $set = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($id in @($idList)) { [void]$set.Add([string]$id) }
    Write-OnboardDetail ("Found {0} existing affiliate folders" -f $set.Count)
    return $set
}

function Resolve-AwinFeedApiKey {
    param([hashtable]$ProviderMeta, [string]$PasswordsDir)
    if ($ProviderMeta.ContainsKey('feedapikey') -and $ProviderMeta['feedapikey']) {
        return [string]$ProviderMeta['feedapikey']
    }
    $fromFile = Read-OptionalSecretFile (Join-Path $PasswordsDir 'awin.feedapikey.txt')
    if ($fromFile) { return $fromFile }
    throw 'needs_credential: feedapikey (provider meta or C:\passwords\awin.feedapikey.txt)'
}

function Resolve-AwinApiToken {
    <#
    Prefer C:\passwords\awin.apitoken.txt (or AWIN_ACCESS_TOKEN). Marker apitoken may be set via
    secure entry but should normally stay empty so the secret is not on S3.
    #>
    param([hashtable]$ProviderMeta, [string]$PasswordsDir)
    if ($env:AWIN_ACCESS_TOKEN) {
        $t = [string]$env:AWIN_ACCESS_TOKEN
        if (-not [string]::IsNullOrWhiteSpace($t)) { return $t.Trim() }
    }
    if ($PasswordsDir) {
        $fromFile = Read-OptionalSecretFile (Join-Path $PasswordsDir 'awin.apitoken.txt')
        if ($fromFile) { return $fromFile }
    }
    if ($ProviderMeta.ContainsKey('apitoken') -and $ProviderMeta['apitoken']) {
        return [string]$ProviderMeta['apitoken']
    }
    return $null
}

function Get-AwinFeedListRows {
    param([string]$FeedListUrlTemplate, [string]$FeedApiKey)
    if (-not $FeedListUrlTemplate) {
        throw 'missing_feedlisturl on provider marker'
    }
    if ($FeedListUrlTemplate -notmatch '\{feedapikey\}') {
        throw 'feedlisturl_must_contain_{feedapikey}_placeholder'
    }
    $url = $FeedListUrlTemplate.Replace('{feedapikey}', $FeedApiKey)
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("awin-feedlist-{0}.csv" -f [guid]::NewGuid().ToString('N'))
    try {
        # Download inside a job so the host can spin /|\| while waiting (URL never printed)
        $null = Invoke-OnboardWithSpinner -Label 'Downloading Awin Feed List' -ArgumentList @($url, $tmp) -ScriptBlock {
            param($u, $path)
            Invoke-WebRequest -Uri $u -OutFile $path -UseBasicParsing -TimeoutSec 180
            if (-not (Test-Path -LiteralPath $path)) { throw 'feedlist_download_empty' }
            return (Get-Item -LiteralPath $path).Length
        }
        Write-OnboardDetail ("Feed List saved locally ({0} bytes on disk; parsing...)" -f (Get-Item -LiteralPath $tmp).Length)
        $rows = @(Import-Csv -LiteralPath $tmp)
        Write-OnboardDetail ("Feed List rows={0}" -f $rows.Count)
        return $rows
    }
    finally {
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
        $url = $null
        $FeedApiKey = $null
    }
}

function Select-AwinPrimaryFeeds {
    param([object[]]$Rows)
    # Membership Status = active; prefer English + GB; one feed id per advertiser
    $active = @($Rows | Where-Object {
            $st = [string]$_.('Membership Status')
            $st -eq 'active' -or $st -eq 'Active'
        })
    $byId = @{}
    foreach ($r in $active) {
        $id = [string]$r.('Advertiser ID')
        if ($id -notmatch '^\d+$') { continue }
        $lang = [string]$r.Language
        $region = [string]$r.('Primary Region')
        $products = 0
        [void][int]::TryParse([string]$r.('No of products'), [ref]$products)
        $fid = [string]$r.('Feed ID')
        if (-not $fid) { continue }
        $score = 0
        if ($lang -match '^(English|en)\b') { $score += 100 }
        elseif ($lang -match '\ben\b') { $score += 50 }
        if ($region -eq 'GB' -or $region -eq 'UK') { $score += 20 }
        $score += [Math]::Min($products, 1000000) / 1000000.0
        $candidate = [pscustomobject]@{
            Id       = $id
            Name     = [string]$r.('Advertiser Name')
            FeedId   = $fid
            Language = $lang
            Region   = $region
            Products = $products
            Sector   = [string]$r.Vertical
            Score    = $score
        }
        if (-not $byId.ContainsKey($id) -or $candidate.Score -gt $byId[$id].Score) {
            $byId[$id] = $candidate
        }
    }
    return @($byId.Values)
}

function Get-AwinJoinedProgrammeIds {
    param([string]$ApiBase, [string]$PublisherId, [string]$AccessToken)
    if (-not $AccessToken) { return @() }
    if (-not $ApiBase) { $ApiBase = 'https://api.awin.com' }
    $url = "{0}/publishers/{1}/programmes?relationship=joined" -f $ApiBase.TrimEnd('/'), $PublisherId
    $jsonText = Invoke-OnboardWithSpinner -Label 'Waiting on Awin programmes?relationship=joined' -ArgumentList @($url, $AccessToken) -ScriptBlock {
        param($u, $token)
        $headers = @{ Authorization = "Bearer $token"; Accept = 'application/json' }
        $resp = Invoke-WebRequest -Uri $u -Headers $headers -UseBasicParsing -TimeoutSec 120
        return $resp.Content
    }
    $AccessToken = $null
    $resp = $jsonText | ConvertFrom-Json
    $out = @()
    foreach ($p in @($resp)) {
        $id = $null
        if ($p.id) { $id = [string]$p.id }
        elseif ($p.advertiserId) { $id = [string]$p.advertiserId }
        if ($id -match '^\d+$') {
            $out += [pscustomobject]@{
                Id       = $id
                Name     = [string]($p.name)
                Website  = [string]($p.displayUrl)
                Sector   = [string]($p.primarySector)
                Currency = [string]($p.currencyCode)
                LogoUrl  = (Normalize-OnboardLogourl -Url ([string]($p.logoUrl)))
            }
        }
    }
    return $out
}

function Build-AwinFeedUrl {
    param([hashtable]$ProviderMeta, [string]$FeedId)
    $tmpl = [string]$ProviderMeta['feedurltemplate']
    if (-not $tmpl) {
        throw 'missing_feedurltemplate on provider marker'
    }
    if ($tmpl -notmatch '\{feedapikey\}' -or $tmpl -notmatch '\{feedid\}') {
        throw 'feedurltemplate_must_contain_placeholders'
    }
    return $tmpl.Replace('{feedid}', $FeedId)
}

function Resolve-OnboardNode {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $fallback = 'D:\tools\node\node.exe'
    if (Test-Path -LiteralPath $fallback) { return $fallback }
    throw 'node_required: install Node or put node on PATH'
}

function Write-AffiliateFolderMarker {
    param(
        [string]$Bucket,
        [string]$Provider,
        [string]$AffiliateId,
        [hashtable]$Metadata,
        [bool]$DryRun
    )
    $node = Resolve-OnboardNode
    $upsertJs = Join-Path $here 'run-folder-upsert.js'
    $payload = @{
        bucket      = $Bucket
        provider    = $Provider
        affiliateId = $AffiliateId
        patch       = $Metadata
        dryRun      = $DryRun
    }
    $json = $payload | ConvertTo-Json -Compress -Depth 6
    $prev = $env:A_SEARCH_FOLDER_UPSERT_ARGS
    $env:A_SEARCH_FOLDER_UPSERT_ARGS = $json
    try {
        $out = & $node $upsertJs 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw ("upsert_failed: {0}" -f ($out | Out-String))
        }
        $line = (@($out) | Where-Object { $_ -is [string] -and $_ -match '^\s*\{' } | Select-Object -Last 1)
        if (-not $line) { throw "upsert_no_json: $out" }
        $result = $line | ConvertFrom-Json
        return [pscustomobject]@{
            Action         = [string]$result.action
            Key            = [string]$result.key
            Enabled        = [string]$result.enabled
            DisabledReason = [string]$result.disabledreason
        }
    }
    finally {
        if ($null -eq $prev) { Remove-Item Env:A_SEARCH_FOLDER_UPSERT_ARGS -ErrorAction SilentlyContinue }
        else { $env:A_SEARCH_FOLDER_UPSERT_ARGS = $prev }
    }
}

function Get-AffiliateFolderMeta {
    param([string]$Bucket, [string]$Provider, [string]$AffiliateId, [string]$AwsProfile)
    $key = "{0}/{1}/" -f $Provider, $AffiliateId
    # FR #5174: use FolderS3 helper so --profile is always set.
    try {
        $marker = Get-FolderS3ObjectMeta -Bucket $Bucket -Key $key -Backend aws -SkipTags -AwsProfile $AwsProfile
        $h = @{}
        if ($marker -and $marker.Metadata) {
            foreach ($k in @($marker.Metadata.Keys)) {
                $h[[string]$k] = [string]$marker.Metadata[$k]
            }
        }
        return $h
    }
    catch {
        return $null
    }
}

function Invoke-AwinOnboard {
    param(
        $Location,
        [hashtable]$ProviderMeta,
        [string]$PasswordsDir,
        [bool]$DryRun,
        [bool]$SkipDownload,
        [bool]$ForceDownload,
        [bool]$SkipDeleteInactive,
        [bool]$BackfillLogourl,
        [int]$Max,
        [string]$ReportDir,
        [string]$Backend,
        [string]$AwsProfile
    )

    $provider = [string]$Location.KeyParts[0]
    $publisherId = [string]$ProviderMeta['publisherid']
    if (-not $publisherId) { throw 'missing_publisherid on provider marker' }

    Write-OnboardStep ("Onboard starting for provider={0} dryRun={1}" -f $provider, $DryRun)
    Write-OnboardDetail 'Mode: Feed List (no MFA). Optional joined API if apitoken is set.'

    Write-OnboardStep 'Resolving feed apikey from provider meta / passwords (not printed)'
    $feedKey = Resolve-AwinFeedApiKey -ProviderMeta $ProviderMeta -PasswordsDir $PasswordsDir
    Write-OnboardStep 'Fetching active product feeds from Awin Feed List'
    $rows = Get-AwinFeedListRows -FeedListUrlTemplate ([string]$ProviderMeta['feedlisturl']) -FeedApiKey $feedKey
    $feedKey = $null

    Write-OnboardStep 'Selecting one primary feed per active advertiser (prefer English / GB)'
    $primaries = @(Select-AwinPrimaryFeeds -Rows $rows)
    Write-OnboardDetail ("Active advertisers with a feed: {0}" -f $primaries.Count)

    $existing = Get-ExistingAffiliateIds -Bucket $Location.Bucket -Provider $provider -AwsProfile $AwsProfile

    $activeIds = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($p in $primaries) { [void]$activeIds.Add($p.Id) }

    $newFromFeeds = @($primaries | Where-Object { -not $existing.Contains($_.Id) } | Sort-Object Name)
    if ($Max -gt 0 -and $newFromFeeds.Count -gt $Max) {
        Write-OnboardDetail ("Capping new creates at Max={0} (was {1})" -f $Max, $newFromFeeds.Count)
        $newFromFeeds = @($newFromFeeds | Select-Object -First $Max)
    }
    Write-OnboardStep ("New signups to create: {0}" -f $newFromFeeds.Count)
    foreach ($n in $newFromFeeds) {
        Write-OnboardDetail ("+ {0} {1} (feed {2})" -f $n.Id, $n.Name, $n.FeedId)
    }

    $created = @()
    $updated = @()
    $downloads = @()
    $nofeed = @()
    $deletedInactive = @()
    $failed = @()
    $logourlSet = @()
    $logourlBackfilled = @()

    # Publisher programmes API (Bearer): preferred logoUrl source for logourl.
    # Without a token, Get-OnboardLogourl falls back to the public profile CDN URL.
    # URL only — onboard never downloads image bytes into the affiliate folder.
    $joinedIds = New-Object 'System.Collections.Generic.HashSet[string]'
    $joinedById = @{}
    $logoById = @{}
    $apiToken = Resolve-AwinApiToken -ProviderMeta $ProviderMeta -PasswordsDir $PasswordsDir
    if ($apiToken) {
        Write-OnboardStep 'Fetching joined programmes via Publisher API (logoUrl -> logourl)'
        try {
            $joined = @(Get-AwinJoinedProgrammeIds -ApiBase ([string]$ProviderMeta['apibase']) `
                    -PublisherId $publisherId -AccessToken $apiToken)
            Write-OnboardDetail ("Joined programmes returned: {0}" -f $joined.Count)
            foreach ($j in $joined) {
                [void]$joinedIds.Add($j.Id)
                $joinedById[$j.Id] = $j
                if ($j.LogoUrl) { $logoById[$j.Id] = [string]$j.LogoUrl }
            }
            Write-OnboardDetail ("Programmes with logoUrl: {0}" -f $logoById.Count)
        }
        catch {
            Write-OnboardDetail ("Joined API failed: {0}" -f $_.Exception.Message)
            $failed += [pscustomobject]@{ id = '_joined_api'; reason = [string]$_.Exception.Message }
        }
        finally {
            $apiToken = $null
        }
    }
    else {
        Write-OnboardStep 'No Publisher API token (need C:\passwords\awin.apitoken.txt or AWIN_ACCESS_TOKEN) - joined/nofeed/coupon path and not-joined deletes skipped; logourl uses public CDN on create'
    }

    $ni = 0
    foreach ($row in $newFromFeeds) {
        $ni++
        try {
            $label = if ($DryRun) {
                "Would create folder {0}/{1} ({2}/{3})" -f $provider, $row.Id, $ni, $newFromFeeds.Count
            }
            else {
                "Creating folder {0}/{1} ({2}/{3})" -f $provider, $row.Id, $ni, $newFromFeeds.Count
            }
            Write-OnboardStep ("{0} - {1}" -f $label, $row.Name)
            $feedurl = Build-AwinFeedUrl -ProviderMeta $ProviderMeta -FeedId $row.FeedId
            $meta = @{
                name           = $row.Name
                affiliateid    = $row.Id
                awinmid        = $row.Id
                feedid         = $row.FeedId
                feedurl        = $feedurl
                format         = 'csv'
                compression    = 'gzip'
                enabled        = '1'
                disabledreason = ''
                joined         = '1'
                schedule       = 'weekly'
                source         = 'onboard'
                provider       = $provider
            }
            if ($row.Sector) { $meta['sector'] = $row.Sector }
            $apiLogo = if ($logoById.ContainsKey($row.Id)) { [string]$logoById[$row.Id] } else { '' }
            $meta['logourl'] = Get-OnboardLogourl -AdvertiserId $row.Id -ApiLogoUrl $apiLogo
            $logourlSet += $row.Id
            if ($joinedById.ContainsKey($row.Id)) {
                $j = $joinedById[$row.Id]
                if ($j.Website -and -not $meta.ContainsKey('website')) { $meta['website'] = [string]$j.Website }
                if ($j.Currency -and -not $meta.ContainsKey('currency')) { $meta['currency'] = [string]$j.Currency }
            }
            $result = Invoke-OnboardWithSpinner -Label $label -ArgumentList @(
                $here, $Location.Bucket, $provider, $row.Id, ($meta | ConvertTo-Json -Compress -Depth 6), $DryRun
            ) -ScriptBlock {
                param($toolsDir, $bucket, $prov, $id, $metaJson, $dry)
                $env:A_SEARCH_FOLDER_UPSERT_ARGS = (@{
                        bucket      = $bucket
                        provider    = $prov
                        affiliateId = $id
                        patch       = ($metaJson | ConvertFrom-Json)
                        dryRun      = [bool]$dry
                    } | ConvertTo-Json -Compress -Depth 8)
                try {
                    $out = & node (Join-Path $toolsDir 'run-folder-upsert.js') 2>&1
                    if ($LASTEXITCODE -ne 0) { throw ($out | Out-String) }
                    return (@($out) | Where-Object { $_ -match '^\s*\{' } | Select-Object -Last 1)
                }
                finally {
                    Remove-Item Env:A_SEARCH_FOLDER_UPSERT_ARGS -ErrorAction SilentlyContinue
                }
            }
            $parsed = $result | ConvertFrom-Json
            if ([string]$parsed.action -match 'created') { $created += $row.Id }
            else { $updated += $row.Id }
            Write-OnboardDetail ("folder {0} -> {1}" -f $row.Id, $parsed.action)

            if (-not $DryRun -and -not $SkipDownload) {
                $affPath = Join-Path $Location.Path $row.Id
                $dlLabel = "Downloading feed for {0} {1}" -f $row.Id, $row.Name
                $dlCode = Invoke-OnboardWithSpinner -Label $dlLabel -ArgumentList @(
                    (Join-Path $here 'download.ps1'), $affPath, [bool]$ForceDownload
                ) -ScriptBlock {
                    param($dlPs1, $path, $force)
                    $args = @('-NoProfile', '-File', $dlPs1, '-Path', $path)
                    if ($force) { $args += '-Force' }
                    $p = Start-Process -FilePath 'powershell.exe' -ArgumentList $args -Wait -PassThru -NoNewWindow
                    return $p.ExitCode
                }
                $downloads += [pscustomobject]@{
                    id     = $row.Id
                    status = if ($dlCode -eq 0) { 'ok' } else { "exit_$dlCode" }
                }
                if ($dlCode -eq 0) { Write-OnboardDetail ("download {0} -> ok" -f $row.Id) }
                else {
                    Write-OnboardDetail ("download {0} -> failed exit {1}" -f $row.Id, $dlCode)
                    $failed += [pscustomobject]@{ id = $row.Id; reason = "download_exit_$dlCode" }
                }
            }
            elseif ($DryRun) {
                Write-OnboardDetail ("download {0} -> would_download" -f $row.Id)
                $downloads += [pscustomobject]@{ id = $row.Id; status = 'would_download' }
            }
        }
        catch {
            Write-OnboardDetail ("FAILED {0}: {1}" -f $row.Id, $_.Exception.Message)
            $failed += [pscustomobject]@{ id = $row.Id; reason = [string]$_.Exception.Message }
        }
    }

    # Joined but no product feed: KEEP the affiliate folder (discount coupons etc.).
    # enabled=0 / disabledreason=nofeed so download skips; do NOT delete.
    if ($joinedById.Count -gt 0) {
        foreach ($j in @($joinedById.Values)) {
            if ($activeIds.Contains($j.Id)) { continue }
            if ($Max -gt 0 -and ($created.Count + $nofeed.Count) -ge $Max) { break }
            $nofeed += $j.Id
            if ($existing.Contains($j.Id)) {
                Write-OnboardDetail ("nofeed keep existing {0} {1}" -f $j.Id, $j.Name)
                continue
            }
            Write-OnboardStep ("Creating no-feed (coupon) folder {0} {1}" -f $j.Id, $j.Name)
            $apiLogo = if ($j.LogoUrl) { [string]$j.LogoUrl } else { '' }
            $meta = @{
                name           = $(if ($j.Name) { $j.Name } else { $j.Id })
                affiliateid    = $j.Id
                awinmid        = $j.Id
                enabled        = '0'
                disabledreason = 'nofeed'
                joined         = '1'
                laststatus     = 'missing_feedurl'
                schedule       = 'weekly'
                source         = 'onboard'
                provider       = $provider
                logourl        = (Get-OnboardLogourl -AdvertiserId $j.Id -ApiLogoUrl $apiLogo)
            }
            if ($j.Website) { $meta['website'] = $j.Website }
            if ($j.Sector) { $meta['sector'] = $j.Sector }
            if ($j.Currency) { $meta['currency'] = $j.Currency }
            $logourlSet += $j.Id
            try {
                $result = Write-AffiliateFolderMarker -Bucket $Location.Bucket -Provider $provider `
                    -AffiliateId $j.Id -Metadata $meta -DryRun:$DryRun
                if ($result.Action -match 'created|would_create') { $created += $j.Id } else { $updated += $j.Id }
                Write-OnboardDetail ("{0} -> {1}" -f $j.Id, $result.Action)
            }
            catch {
                Write-OnboardDetail ("FAILED nofeed {0}: {1}" -f $j.Id, $_.Exception.Message)
                $failed += [pscustomobject]@{ id = $j.Id; reason = [string]$_.Exception.Message }
            }
        }
        if ($nofeed.Count -gt 0) {
            Write-OnboardStep ("No-feed joined (kept for coupons / offers): {0}" -f $nofeed.Count)
        }
    }

    # DELETE only when Publisher API says not joined — never for "no Feed List entry".
    # No-feed joined advertisers often still provide discount coupons.
    if ($SkipDeleteInactive) {
        Write-OnboardStep 'SkipDeleteInactive set - leaving folders unchanged'
    }
    elseif ($joinedIds.Count -eq 0) {
        Write-OnboardStep 'No joined programmes API result - not deleting (Feed List absence is not enough; coupons may apply)'
    }
    else {
        $candidates = @($existing | Where-Object { -not $joinedIds.Contains($_) } | Sort-Object)
        Write-OnboardStep ("Deleting {0} folders not in joined programmes (left programme)" -f $candidates.Count)
        $di = 0
        foreach ($id in $candidates) {
            $di++
            $label = "Deleting not-joined {0}/{1} ({2}/{3})" -f $provider, $id, $di, $candidates.Count
            Write-OnboardStep $label
            try {
                $result = Remove-OnboardAffiliatePrefix -Bucket $Location.Bucket -Provider $provider `
                    -AffiliateId $id -DryRun:$DryRun -AwsProfile $AwsProfile
                $deletedInactive += $id
                Write-OnboardDetail ("{0} -> {1}" -f $id, $result.Action)
            }
            catch {
                Write-OnboardDetail ("FAILED delete {0}: {1}" -f $id, $_.Exception.Message)
                $failed += [pscustomobject]@{ id = $id; reason = [string]$_.Exception.Message }
            }
        }
    }

    # logourl is set on create. Do not HEAD every active folder each run.
    # Opt-in -BackfillLogourl for a one-shot catch-up of folders still missing it.
    if ($BackfillLogourl) {
        $stillExisting = @($existing | Where-Object { $activeIds.Contains($_) } | Sort-Object)
        Write-OnboardStep ("BackfillLogourl: scanning {0} active folders for missing logourl" -f $stillExisting.Count)
        $bi = 0
        foreach ($id in $stillExisting) {
            $bi++
            $cur = Get-AffiliateFolderMeta -Bucket $Location.Bucket -Provider $provider -AffiliateId $id -AwsProfile $AwsProfile
            $have = ''
            if ($cur) {
                if ($cur.ContainsKey('logourl')) { $have = [string]$cur['logourl'] }
                elseif ($cur.ContainsKey('logo')) { $have = [string]$cur['logo'] }
            }
            if (-not [string]::IsNullOrWhiteSpace($have)) { continue }
            $apiLogo = if ($logoById.ContainsKey($id)) { [string]$logoById[$id] } else { '' }
            $url = Get-OnboardLogourl -AdvertiserId $id -ApiLogoUrl $apiLogo
            $label = "Backfilling logourl for {0} ({1}/{2})" -f $id, $bi, $stillExisting.Count
            Write-OnboardStep $label
            $patch = @{ logourl = $url; source = 'onboard' }
            try {
                $result = Write-AffiliateFolderMarker -Bucket $Location.Bucket -Provider $provider `
                    -AffiliateId $id -Metadata $patch -DryRun:$DryRun
                $logourlBackfilled += $id
                if ($result.Action -match 'updated|would_update|created|would_create') { $updated += $id }
                Write-OnboardDetail ("{0} -> {1}" -f $id, $result.Action)
            }
            catch {
                Write-OnboardDetail ("FAILED logourl {0}: {1}" -f $id, $_.Exception.Message)
                $failed += [pscustomobject]@{ id = $id; reason = [string]$_.Exception.Message }
            }
        }
        Write-OnboardDetail ("logourl backfilled={0}" -f $logourlBackfilled.Count)
    }

    $report = [ordered]@{
        tool               = 'onboard'
        provider           = $provider
        dryRun             = $DryRun
        startedAt          = (Get-Date).ToUniversalTime().ToString('o')
        existingFolders    = $existing.Count
        activeFeeds        = $primaries.Count
        newWithFeed        = @($newFromFeeds | ForEach-Object { $_.Id })
        foldersCreated     = $created
        foldersUpdated     = $updated
        deletedInactive    = $deletedInactive
        noFeedFollowUps    = $nofeed
        logourlSet         = $logourlSet
        logourlBackfilled  = $logourlBackfilled
        downloads          = $downloads
        failed             = $failed
    }

    $day = (Get-Date).ToString('yyyy-MM-dd')
    $rdir = if ($ReportDir) { $ReportDir } else {
        Join-Path 'C:\ai\a-search\logs' ("{0}-onboard" -f $provider)
    }
    if (-not $DryRun) {
        New-Item -ItemType Directory -Force -Path $rdir | Out-Null
        $reportPath = Join-Path $rdir ("{0}.json" -f $day)
        ($report | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $reportPath -Encoding utf8
        $report['reportPath'] = $reportPath
    }

    return $report
}

# ---- main ----
# FR #5176: resolve profile for explicit --profile argv; keep env for any leftover ambient callers.
$profileName = Resolve-OnboardAwsProfile -AwsProfile $AwsProfile
$env:AWS_PROFILE = $profileName
$passDir = Get-OnboardPasswordsDir -PasswordsDir $PasswordsDir

$target = if ($Path) { $Path } else { (Get-Location).Path }
$loc = ConvertTo-FolderS3Location -Path $target -MountRoot $MountRoot
if ([string]::IsNullOrEmpty($loc.Key)) {
    Write-Error ("bucket_root: s3://{0}/; cd into a provider folder" -f $loc.Bucket)
    exit 5
}
if ($loc.Bucket -ne 'a-affiliates') {
    Write-Error "not_a_affiliates: onboard only runs under a-affiliates"
    exit 3
}
if ($loc.Kind -ne 'provider') {
    Write-Error "not_provider: run onboard from S:\a-affiliates\{provider} (got kind=$($loc.Kind))"
    exit 3
}

Write-OnboardStep ("Reading provider marker meta for s3://{0}/{1}" -f $loc.Bucket, $loc.Key)
$providerMeta = Get-ProviderMetaRaw -Location $loc -Backend $Backend -AwsProfile $profileName
$providerName = [string]$loc.KeyParts[0]
Write-OnboardDetail ("provider={0} name={1}" -f $providerName, $(if ($providerMeta['name']) { $providerMeta['name'] } else { '?' }))

try {
    switch ($providerName) {
        'awin' {
            $report = Invoke-AwinOnboard -Location $loc -ProviderMeta $providerMeta `
                -PasswordsDir $passDir -DryRun:$DryRun -SkipDownload:$SkipDownload `
                -ForceDownload:$ForceDownload -SkipDeleteInactive:$SkipDeleteInactive `
                -BackfillLogourl:$BackfillLogourl `
                -Max $Max -ReportDir $ReportDir -Backend $Backend -AwsProfile $profileName
        }
        default {
            Write-Error "provider_not_supported: $providerName (onboard currently implements awin)"
            exit 3
        }
    }
}
catch {
    $msg = [string]$_.Exception.Message
    if ($msg -match 'needs_credential') {
        Write-Output $msg
    $detailForIssue = $null
    if (Get-Variable -Name safe -Scope 0 -ErrorAction SilentlyContinue) { $detailForIssue = $safe }
    elseif (Get-Variable -Name msg -Scope 0 -ErrorAction SilentlyContinue) { $detailForIssue = $msg }
    else { $detailForIssue = $_.Exception.Message }
    $exitForIssue = 1
    if ($detailForIssue -match '^path_outside_mount') { $exitForIssue = 2 }
    elseif ($detailForIssue -match '^bucket_root') { $exitForIssue = 5 }
    $s3ForIssue = ''
    Invoke-ASearchToolFailureReport -Tool 'onboard' -ErrorCode 'error' -Detail ([string]$detailForIssue) -ExitCode $exitForIssue -S3Uri ([string]$s3ForIssue) -CommandLine ([string]$MyInvocation.Line)

        exit 2
    }
    Write-Error $msg
    exit 1
}

Write-OnboardStep 'Onboard finished - writing summary'
# Human-readable summary (ids only; never secrets)
Write-Host ("onboard provider={0} dryRun={1}" -f $report.provider, $report.dryRun)
Write-Host ("existingFolders={0} activeFeeds={1}" -f $report.existingFolders, $report.activeFeeds)
Write-Host ("newWithFeed={0}" -f ($report.newWithFeed -join ','))
Write-Host ("foldersCreated={0}" -f ($report.foldersCreated -join ','))
Write-Host ("foldersUpdated={0}" -f ($report.foldersUpdated -join ','))
Write-Host ("deletedInactive={0}" -f ($report.deletedInactive -join ','))
Write-Host ("noFeedFollowUps={0}" -f ($report.noFeedFollowUps -join ','))
Write-Host ("logourlSet={0}" -f ($report.logourlSet -join ','))
Write-Host ("logourlBackfilled={0}" -f ($report.logourlBackfilled -join ','))
if (@($report.failed).Count) {
    Write-Host ("failed={0}" -f (($report.failed | ForEach-Object { "{0}:{1}" -f $_.id, $_.reason }) -join ';'))
}
# Machine-readable report on the success stream (for piping)
Write-Output ($report | ConvertTo-Json -Depth 6 -Compress)

if (@($report.failed).Count -gt 0) { exit 1 }
exit 0
