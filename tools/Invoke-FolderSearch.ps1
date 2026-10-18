<#
.SYNOPSIS
POST /search for the a-clubs GUID folder under the mapped S3 drive (FR #4043, FR #4334).

.DESCRIPTION
In a-clubs/{hostkey}/{guid}: reads searches.json and POSTs /search.
Payload matches the annotator: host, hostkey, guid, queries, exclude, plus
market and currency when present, and metadata userid (never customernumber).
Never writes S3. Never prints the agent key.
Env: A_SEARCH_API_URL and A_SEARCH_AGENT_API_KEY_FILE, with
A_SEARCH_SEARCH_API_URL, A_SEARCH_AGENT_API_KEY, and folder-tools config as fallbacks.
Missing searches.json, a non-GUID folder, or a missing URL/key fails clearly.
-WhatIf prints the payload and does not POST. -Json prints searchid, query_count,
and providers_queued. A host folder still needs -All.

.PARAMETER Path
Filesystem path (default cwd).

.PARAMETER All
Host folder only: invoke /search once per GUID subfolder.

.PARAMETER Json
Print one JSON object per GUID (searchid, query_count, providers_queued). No key.

.PARAMETER WhatIf
Print the POST payload and do not call /search. No key.

.PARAMETER ConfigPath
JSON config with SearchApiUrl (and optional AgentApiKeyEnv / AwsProfile).
#>
[CmdletBinding()]
param(
    [string]$Path,
    [string]$MountRoot,
    [switch]$All,
    [switch]$Json,
    [switch]$WhatIf,
    [string]$ConfigPath,
    [string]$AwsProfile,
    [string]$SearchApiUrl,
    [string]$AgentApiKey,
    [ValidateSet('auto', 'aws', 'rclone')][string]$Backend = 'auto',
    [scriptblock]$AwsHeadObject,
    [scriptblock]$AwsGetObjectTagging,
    [scriptblock]$AwsGetObject,
    [scriptblock]$RcloneLsJson,
    [scriptblock]$RcloneCat,
    [scriptblock]$InvokeSearch,
    [scriptblock]$ListGuidChildren
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
. (Join-Path $here 'FolderS3.ps1')

function Get-FolderToolsConfig {
    param([string]$ConfigPath)
    $candidates = @()
    if ($ConfigPath) { $candidates += $ConfigPath }
    if ($env:A_SEARCH_FOLDER_TOOLS_CONFIG) { $candidates += $env:A_SEARCH_FOLDER_TOOLS_CONFIG }
    $candidates += (Join-Path $here 'folder-tools.config.json')
    $candidates += (Join-Path $env:ProgramData 'a-search\folder-tools.config.json')
    foreach ($c in $candidates) {
        if ($c -and (Test-Path -LiteralPath $c)) {
            return (Get-Content -LiteralPath $c -Raw -Encoding UTF8 | ConvertFrom-Json)
        }
    }
    return $null
}

function Resolve-SearchEndpoint {
    param($Config, [string]$SearchApiUrl)
    if ($SearchApiUrl) { return $SearchApiUrl.TrimEnd('/') }
    if ($env:A_SEARCH_API_URL) { return $env:A_SEARCH_API_URL.TrimEnd('/') }
    if ($env:A_SEARCH_SEARCH_API_URL) { return $env:A_SEARCH_SEARCH_API_URL.TrimEnd('/') }
    if ($Config -and $Config.SearchApiUrl) { return ([string]$Config.SearchApiUrl).TrimEnd('/') }
    throw 'search_api_url_required: set -SearchApiUrl, A_SEARCH_API_URL, A_SEARCH_SEARCH_API_URL, or folder-tools.config.json'
}

function Resolve-AgentKey {
    param($Config, [string]$AgentApiKey)
    if ($AgentApiKey) { return $AgentApiKey }
    $file = [Environment]::GetEnvironmentVariable('A_SEARCH_AGENT_API_KEY_FILE')
    if ($file) {
        $file = $file.Trim()
        if (-not $file -or -not (Test-Path -LiteralPath $file)) {
            throw 'agent_api_key_file_unreadable: A_SEARCH_AGENT_API_KEY_FILE is set but the file cannot be read'
        }
        $text = [System.IO.File]::ReadAllText($file).Trim()
        if (-not $text) {
            throw 'agent_api_key_required: A_SEARCH_AGENT_API_KEY_FILE is empty'
        }
        return $text
    }
    $envName = 'A_SEARCH_AGENT_API_KEY'
    if ($Config -and $Config.AgentApiKeyEnv) { $envName = [string]$Config.AgentApiKeyEnv }
    $v = [Environment]::GetEnvironmentVariable($envName)
    if ($v) { return $v }
    throw "agent_api_key_required: set A_SEARCH_AGENT_API_KEY_FILE or env $envName"
}

function Resolve-AwsProfileName {
    param($Config, [string]$AwsProfile)
    if ($AwsProfile) { return $AwsProfile }
    if ($env:A_SEARCH_AGENTS_AWS_PROFILE) { return $env:A_SEARCH_AGENTS_AWS_PROFILE }
    if ($Config -and $Config.AwsProfile) { return [string]$Config.AwsProfile }
    return 'a-search-redqueen-agents'
}

function Invoke-AgentSearchHttp {
    param(
        [Parameter(Mandatory = $true)][string]$Endpoint,
        [Parameter(Mandatory = $true)][hashtable]$Body,
        [Parameter(Mandatory = $true)][string]$AgentApiKey,
        [string]$AwsProfile,
        [scriptblock]$InvokeSearch
    )
    if ($InvokeSearch) {
        return & $InvokeSearch $Endpoint $Body $AgentApiKey $AwsProfile
    }
    # Prefer curl.exe with --aws-sigv4 when profile is set; else raw HTTPS with agent key only.
    $uri = "$Endpoint/search"
    $json = $Body | ConvertTo-Json -Compress -Depth 8
    $headers = @{
        'content-type'   = 'application/json'
        'x-agent-api-key' = $AgentApiKey
    }
    # Never log headers/body with secrets --- Write-Verbose only endpoint + hostkey/guid
    Write-Verbose ("POST {0} hostkey={1} guid={2}" -f $uri, $Body.hostkey, $Body.guid)

    if ($AwsProfile -and (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
        $tmp = [System.IO.Path]::GetTempFileName()
        try {
            [System.IO.File]::WriteAllText($tmp, $json)
            $out = & curl.exe -sS -X POST $uri `
                -H 'content-type: application/json' `
                -H ("x-agent-api-key: {0}" -f $AgentApiKey) `
                --aws-sigv4 "aws:amz:eu-west-2:execute-api" `
                --user ("{0}:" -f $AwsProfile) `
                --data-binary ("@{0}" -f $tmp) 2>&1
            $code = $LASTEXITCODE
            if ($code -ne 0) { throw "search_http_failed: curl exit $code" }
            return $out
        }
        finally {
            Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
        }
    }

    # Fallback: Invoke-RestMethod with agent key (SigV4 optional when IAM authorizer not required locally)
    $resp = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $json -ContentType 'application/json'
    return ($resp | ConvertTo-Json -Compress -Depth 8)
}

function Read-SearchesQueries {
    param($Location, $Backend, $AwsGetObject, $RcloneCat)
    $raw = Get-FolderS3TextObject -Bucket $Location.Bucket -Key ($Location.Key + 'searches.json') `
        -Backend $Backend -AwsGetObject $AwsGetObject -RcloneCat $RcloneCat
        if (-not $raw) {
        throw 'searches_json_missing'
    }
    $doc = ConvertFrom-FolderS3Json $raw
    $queries = @()
    if ($doc -and $doc.queries) { $queries = @($doc.queries) }
    $exclude = @()
    if ($doc -and $doc.exclude) { $exclude = @($doc.exclude) }
    $market = ''
    $currency = ''
    if ($doc -and $doc.PSObject.Properties['market'] -and $doc.market) { $market = [string]$doc.market }
    if ($doc -and $doc.PSObject.Properties['currency'] -and $doc.currency) { $currency = [string]$doc.currency }
    return @{ queries = $queries; exclude = $exclude; market = $market; currency = $currency }
}

function Get-HostUserId {
    param($HostMeta)
    if (-not $HostMeta) { return '' }
    foreach ($name in @('userid', 'UserId', 'userId')) {
        if ($HostMeta.ContainsKey($name) -and $HostMeta[$name]) {
            return [string]$HostMeta[$name]
        }
    }
    return ''
}

function Invoke-OneGuidSearch {
    param(
        $GuidLocation,
        $HostMeta,
        $Endpoint,
        $AgentApiKey,
        $AwsProfile,
        $Backend,
        $AwsGetObject,
        $RcloneCat,
        $InvokeSearch,
        [switch]$WhatIf
    )
    $guid = Get-FolderS3Guid -Location $GuidLocation
    $hostkey = Get-FolderS3ParentHostKey -Location $GuidLocation
    # FR: use metadata.host (original host) when present; API accepts host|hostkey
    $hostForApi = $hostkey
    if ($HostMeta -and $HostMeta['host']) { $hostForApi = [string]$HostMeta['host'] }
    elseif ($HostMeta -and $HostMeta['Host']) { $hostForApi = [string]$HostMeta['Host'] }

    $sq = Read-SearchesQueries -Location $GuidLocation -Backend $Backend `
        -AwsGetObject $AwsGetObject -RcloneCat $RcloneCat

    $userid = Get-HostUserId -HostMeta $HostMeta
    $body = @{
        host    = $hostForApi
        hostkey = $hostkey
        guid    = $guid
        queries = @($sq.queries)
        exclude = @($sq.exclude)
    }
    if ($userid) { $body.userid = $userid }
    if ($sq.market) { $body.market = [string]$sq.market }
    if ($sq.currency) { $body.currency = [string]$sq.currency }

    if ($WhatIf) {
        return [pscustomobject]@{
            hostkey  = $hostkey
            host     = $hostForApi
            guid     = $guid
            userid   = $userid
            queries  = $sq.queries
            body     = $body
            whatif   = $true
            response = $null
        }
    }

    $raw = Invoke-AgentSearchHttp -Endpoint $Endpoint -Body $body `
        -AgentApiKey $AgentApiKey -AwsProfile $AwsProfile -InvokeSearch $InvokeSearch

    $parsed = $null
    try { $parsed = ConvertFrom-FolderS3Json $raw } catch { $parsed = $raw }

    [pscustomobject]@{
        hostkey  = $hostkey
        host     = $hostForApi
        guid     = $guid
        queries  = $sq.queries
        userid   = $userid
        body     = $body
        whatif   = $false
        response = $parsed
    }
}

try {
    $target = if ($Path) { $Path } else { (Get-Location).Path }
    $loc = ConvertTo-FolderS3Location -Path $target -MountRoot $MountRoot

    if ($loc.Bucket.ToLowerInvariant() -ne 'a-clubs') {
        [Console]::Error.WriteLine("not_a_clubs: Invoke-FolderSearch only works under a-clubs host/GUID folders (got bucket=$($loc.Bucket) kind=$($loc.Kind))")
        exit 3
    }
    if ($loc.Kind -notin @('host', 'guid')) {
        [Console]::Error.WriteLine("not_guid_folder: not_host_or_guid: kind=$($loc.Kind); run inside a-clubs/{hostkey}/{guid}")
        exit 3
    }

    $cfg = Get-FolderToolsConfig -ConfigPath $ConfigPath
    $endpoint = Resolve-SearchEndpoint -Config $cfg -SearchApiUrl $SearchApiUrl
    $apiKey = Resolve-AgentKey -Config $cfg -AgentApiKey $AgentApiKey
    $profile = Resolve-AwsProfileName -Config $cfg -AwsProfile $AwsProfile

    $results = @()

    if ($loc.Kind -eq 'guid') {
        $hostKeyName = Get-FolderS3ParentHostKey -Location $loc
        $hostMarker = Get-FolderS3ObjectMeta -Bucket $loc.Bucket -Key ($hostKeyName + '/') `
            -Backend $Backend -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
            -RcloneLsJson $RcloneLsJson
            $one = Invoke-OneGuidSearch -GuidLocation $loc -HostMeta $hostMarker.Metadata `
            -Endpoint $endpoint -AgentApiKey $apiKey -AwsProfile $profile `
            -Backend $Backend -AwsGetObject $AwsGetObject -RcloneCat $RcloneCat `
            -InvokeSearch $InvokeSearch -WhatIf:$WhatIf
        $results += $one
    }
    else {
        # host folder
        if (-not $All) {
            [Console]::Error.WriteLine('not_guid_folder: host_folder_needs_all: cwd is a host folder; pass -All to POST /search for each GUID child')
            exit 4
        }
        $hostMarker = Get-FolderS3ObjectMeta -Bucket $loc.Bucket -Key $loc.Key `
            -Backend $Backend -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
            -RcloneLsJson $RcloneLsJson

        $children = @()
        if ($ListGuidChildren) {
            $children = @(& $ListGuidChildren $loc)
        }
        else {
            # Prefer local filesystem listing under the mount (mapped drive).
            $dirs = Get-ChildItem -LiteralPath $loc.Path -Directory -ErrorAction SilentlyContinue
            foreach ($d in @($dirs)) {
                $guidLoc = ConvertTo-FolderS3Location -Path $d.FullName -MountRoot $loc.MountRoot
                if ($guidLoc.Kind -eq 'guid') { $children += $guidLoc }
            }
        }
        if (-not $children.Count) {
            Write-Output 'no_guid_children'
            exit 0
        }
        foreach ($g in $children) {
                $results += Invoke-OneGuidSearch -GuidLocation $g -HostMeta $hostMarker.Metadata `
                -Endpoint $endpoint -AgentApiKey $apiKey -AwsProfile $profile `
                -Backend $Backend -AwsGetObject $AwsGetObject -RcloneCat $RcloneCat `
                -InvokeSearch $InvokeSearch -WhatIf:$WhatIf
        }
    }

    # Print results without credentials
    foreach ($r in $results) {
        $queryCount = @($r.queries).Count
        $providers = ''
        $searchId = ''
        if ($r.response) {
            $sidProp = $r.response.PSObject.Properties['searchid']
            if ($sidProp -and $sidProp.Value) { $searchId = [string]$sidProp.Value }
            $qProp = $r.response.PSObject.Properties['queued']
            if ($qProp -and $qProp.Value) { $providers = (@($qProp.Value) -join ',') }
        }
        if ($r.whatif) {
            Write-Output 'whatif=1'
            Write-Output ($r.body | ConvertTo-Json -Compress -Depth 8)
            Write-Output '---'
            continue
        }
        if ($Json) {
            $doc = [ordered]@{
                host              = $r.host
                hostkey           = $r.hostkey
                guid              = $r.guid
                userid            = $r.userid
                query_count       = $queryCount
                searchid          = $searchId
                providers_queued  = $providers
            }
            Write-Output ($doc | ConvertTo-Json -Compress -Depth 6)
            continue
        }
        Write-Output ("host={0} hostkey={1} guid={2}" -f $r.host, $r.hostkey, $r.guid)
        Write-Output ("queries={0}" -f (($r.queries | ConvertTo-Json -Compress -Depth 5)))
        Write-Output ("query_count={0}" -f $queryCount)
        if ($searchId) {
            Write-Output ("searchid={0}" -f $searchId)
        }
        if ($providers) {
            Write-Output ("queued={0}" -f $providers)
            Write-Output ("providers_queued={0}" -f $providers)
        }
        else {
            Write-Output ("response={0}" -f ($r.response | ConvertTo-Json -Compress -Depth 6))
        }
        Write-Output '---'
    }
    exit 0
}
catch {
    $msg = $_.Exception.Message
    # Never echo secrets if a key accidentally landed in the message
    $safe = $msg -replace '(?i)(api[_-]?key|token|password|secret)\s*[:=]\s*\S+', '$1=***'
    [Console]::Error.WriteLine($safe)
    if ($safe -match '^path_outside_mount') {
        exit 2
    }
    exit 1
}
