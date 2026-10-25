<#
.SYNOPSIS
POST /search for the a-clubs GUID folder under the mapped S3 drive (FR #4043, FR #4334).

.DESCRIPTION
In a-clubs/{hostkey}/{guid}: reads searches.json and POSTs /search.
Payload matches the annotator: host, hostkey, guid, queries, exclude, plus
market and currency when present, and metadata userid (never customernumber).
Never writes S3. Never prints credentials.
Auth is IAM SigV4 (FR #4888 / #5086); no x-agent-api-key.
Env: A_SEARCH_API_URL / A_SEARCH_SEARCH_API_URL, folder-tools.config.json SearchApiUrl,
or (when -AwsProfile is set) CloudFormation stack output SearchApiUrl.
Missing searches.json, a non-GUID folder, or a missing URL fails clearly.
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
JSON config with SearchApiUrl (and optional AwsProfile / SearchStackName).
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
    [scriptblock]$ListGuidChildren,
    # FR #5078: injectable AWS credential resolver + curl argv runner (tests / alternate clients)
    [scriptblock]$ResolveAwsCredentials,
    [scriptblock]$CurlInvoke
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
    param(
        $Config,
        [string]$SearchApiUrl,
        [string]$AwsProfile
    )
    if ($SearchApiUrl) { return $SearchApiUrl.TrimEnd('/') }
    if ($env:A_SEARCH_API_URL) { return $env:A_SEARCH_API_URL.TrimEnd('/') }
    if ($env:A_SEARCH_SEARCH_API_URL) { return $env:A_SEARCH_SEARCH_API_URL.TrimEnd('/') }
    if ($Config -and $Config.SearchApiUrl) {
        $fromCfg = ([string]$Config.SearchApiUrl).Trim()
        if ($fromCfg -and $fromCfg -notmatch 'EXAMPLE') { return $fromCfg.TrimEnd('/') }
    }
    # FR #5086: optional stack output when aws CLI can describe ASearchStack
    $stackName = 'ASearchStack'
    if ($Config -and $Config.SearchStackName) { $stackName = [string]$Config.SearchStackName }
    if ($env:A_SEARCH_STACK_NAME) { $stackName = $env:A_SEARCH_STACK_NAME.Trim() }
    if (Get-Command aws -ErrorAction SilentlyContinue) {
        try {
            $awsArgs = @(
                'cloudformation', 'describe-stacks',
                '--stack-name', $stackName,
                '--query', "Stacks[0].Outputs[?OutputKey=='SearchApiUrl'].OutputValue",
                '--output', 'text'
            )
            if ($AwsProfile) { $awsArgs = @('--profile', $AwsProfile) + $awsArgs }
            $raw = & aws @awsArgs 2>$null
            if ($LASTEXITCODE -eq 0) {
                $url = (($raw | Out-String) -replace '[\u0000-\u001F]', '').Trim()
                if ($url -and $url -ne 'None' -and $url -match '^https://') {
                    return $url.TrimEnd('/')
                }
            }
        } catch { }
    }
    throw 'search_api_url_required: set -SearchApiUrl, A_SEARCH_API_URL, A_SEARCH_SEARCH_API_URL, folder-tools.config.json SearchApiUrl, or ensure stack SearchApiUrl is readable via aws cloudformation describe-stacks'
}

# FR #5086: agent key optional / unused for IAM /search. Kept for inject/tests only.
function Resolve-AgentKey {
    param($Config, [string]$AgentApiKey)
    if ($AgentApiKey) { return $AgentApiKey }
    $file = [Environment]::GetEnvironmentVariable('A_SEARCH_AGENT_API_KEY_FILE')
    if ($file) {
        $file = $file.Trim()
        if ($file -and (Test-Path -LiteralPath $file)) {
            $t = [System.IO.File]::ReadAllText($file).Trim()
            if ($t) { return $t }
        }
    }
    $envName = 'A_SEARCH_AGENT_API_KEY'
    if ($Config -and $Config.AgentApiKeyEnv) { $envName = [string]$Config.AgentApiKeyEnv }
    $v = [Environment]::GetEnvironmentVariable($envName)
    if ($v) { return $v }
    return ''
}

function Resolve-AwsProfileName {
    param($Config, [string]$AwsProfile)
    if ($AwsProfile) { return $AwsProfile }
    if ($env:A_SEARCH_AGENTS_AWS_PROFILE) { return $env:A_SEARCH_AGENTS_AWS_PROFILE }
    if ($Config -and $Config.AwsProfile) { return [string]$Config.AwsProfile }
    return 'a-search-redqueen-annotator'
}

# FR #5078: resolve real AK/SK/(session) from a named profile. Never log the values.
# Default: `aws configure export-credentials --profile <p> --format process`.
function Resolve-AwsCliCredentials {
    param(
        [Parameter(Mandatory = $true)][string]$ProfileName,
        [scriptblock]$Resolver
    )
    if ($Resolver) {
        $doc = & $Resolver $ProfileName
        # Scriptblocks may emit arrays; take the last non-null object with keys.
        if ($doc -is [System.Array]) {
            $picked = $null
            foreach ($item in @($doc)) {
                if ($null -ne $item) { $picked = $item }
            }
            $doc = $picked
        }
    }
    else {
        if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
            throw 'aws_cli_required: need aws CLI to resolve profile credentials for SigV4'
        }
        $raw = & aws configure export-credentials --profile $ProfileName --format process 2>&1
        $code = $LASTEXITCODE
        if ($code -ne 0) {
            throw ("aws_credentials_failed: export-credentials exit {0}" -f $code)
        }
        $text = (($raw | Out-String) -replace '[\u0000-\u0008\u000B\u000C\u000E-\u001F]', '').Trim()
        try {
            $doc = $text | ConvertFrom-Json
        }
        catch {
            throw 'aws_credentials_failed: export-credentials JSON parse failed'
        }
    }
    $ak = ''
    $sk = ''
    $tok = ''
    if ($null -ne $doc) {
        if ($doc -is [System.Collections.IDictionary]) {
            if ($doc.Contains('AccessKeyId')) { $ak = [string]$doc['AccessKeyId'] }
            if ($doc.Contains('SecretAccessKey')) { $sk = [string]$doc['SecretAccessKey'] }
            if ($doc.Contains('SessionToken') -and $doc['SessionToken']) {
                $tok = [string]$doc['SessionToken']
            }
        }
        else {
            if ($doc.PSObject.Properties['AccessKeyId']) { $ak = [string]$doc.AccessKeyId }
            if ($doc.PSObject.Properties['SecretAccessKey']) { $sk = [string]$doc.SecretAccessKey }
            if ($doc.PSObject.Properties['SessionToken'] -and $doc.SessionToken) {
                $tok = [string]$doc.SessionToken
            }
        }
    }
    if (-not $ak -or -not $sk) {
        throw 'aws_credentials_incomplete: AccessKeyId/SecretAccessKey missing'
    }
    # Guard: never treat the profile name as an access key (the pre-#5078 curl bug).
    if ($ak -eq $ProfileName) {
        throw 'aws_credentials_invalid: AccessKeyId must not equal the profile name'
    }
    return @{
        AccessKeyId     = $ak
        SecretAccessKey = $sk
        SessionToken    = $tok
    }
}

function Invoke-AgentSearchHttp {
    param(
        [Parameter(Mandatory = $true)][string]$Endpoint,
        [Parameter(Mandatory = $true)][hashtable]$Body,
        [string]$AgentApiKey,
        [string]$AwsProfile,
        [scriptblock]$InvokeSearch,
        [scriptblock]$ResolveAwsCredentials,
        [scriptblock]$CurlInvoke
    )
    if ($InvokeSearch) {
        return & $InvokeSearch $Endpoint $Body $AgentApiKey $AwsProfile
    }
    # Prefer curl.exe with --aws-sigv4 when profile is set (FR #4888 / #5078 / #5086).
    # Do not send x-agent-api-key — gateway IAM is the only auth.
    $uri = "$Endpoint/search"
    $json = $Body | ConvertTo-Json -Compress -Depth 8
    # Never log headers/body with secrets --- Write-Verbose only endpoint + hostkey/guid
    Write-Verbose ("POST {0} hostkey={1} guid={2}" -f $uri, $Body.hostkey, $Body.guid)

    if (-not $AwsProfile) {
        throw 'aws_profile_required: IAM SigV4 needs -AwsProfile (default a-search-redqueen-annotator)'
    }
    if (-not ($CurlInvoke -or (Get-Command curl.exe -ErrorAction SilentlyContinue))) {
        throw 'curl_required: need curl.exe for --aws-sigv4 POST /search'
    }

    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        [System.IO.File]::WriteAllText($tmp, $json)
        # FR #5078: resolve real credentials; never pass the profile name as --user.
        $creds = Resolve-AwsCliCredentials -ProfileName $AwsProfile -Resolver $ResolveAwsCredentials
        $userPair = '{0}:{1}' -f $creds.AccessKeyId, $creds.SecretAccessKey
        $curlArgs = @(
            '-sS', '-X', 'POST', $uri,
            '-H', 'content-type: application/json',
            '--aws-sigv4', 'aws:amz:eu-west-2:execute-api',
            '--user', $userPair
        )
        if ($creds.SessionToken) {
            $curlArgs += @('-H', ('x-amz-security-token: {0}' -f $creds.SessionToken))
        }
        $curlArgs += @('--data-binary', ('@{0}' -f $tmp))
        if ($CurlInvoke) {
            $out = & $CurlInvoke $curlArgs
        }
        else {
            $out = & curl.exe @curlArgs 2>&1
            $code = $LASTEXITCODE
            if ($code -ne 0) { throw "search_http_failed: curl exit $code" }
        }
        return $out
    }
    finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
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
        $ResolveAwsCredentials,
        $CurlInvoke,
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
        -AgentApiKey $AgentApiKey -AwsProfile $AwsProfile -InvokeSearch $InvokeSearch `
        -ResolveAwsCredentials $ResolveAwsCredentials -CurlInvoke $CurlInvoke

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
    $profile = Resolve-AwsProfileName -Config $cfg -AwsProfile $AwsProfile
    $endpoint = Resolve-SearchEndpoint -Config $cfg -SearchApiUrl $SearchApiUrl -AwsProfile $profile
    # FR #5086: key unused for IAM /search; still resolve for injectable -InvokeSearch tests.
    $apiKey = Resolve-AgentKey -Config $cfg -AgentApiKey $AgentApiKey

    $results = @()

    if ($loc.Kind -eq 'guid') {
        $hostKeyName = Get-FolderS3ParentHostKey -Location $loc
        $hostMarker = Get-FolderS3ObjectMeta -Bucket $loc.Bucket -Key ($hostKeyName + '/') `
            -Backend $Backend -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
            -RcloneLsJson $RcloneLsJson
            $one = Invoke-OneGuidSearch -GuidLocation $loc -HostMeta $hostMarker.Metadata `
            -Endpoint $endpoint -AgentApiKey $apiKey -AwsProfile $profile `
            -Backend $Backend -AwsGetObject $AwsGetObject -RcloneCat $RcloneCat `
            -InvokeSearch $InvokeSearch `
            -ResolveAwsCredentials $ResolveAwsCredentials -CurlInvoke $CurlInvoke `
            -WhatIf:$WhatIf
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
                -InvokeSearch $InvokeSearch `
                -ResolveAwsCredentials $ResolveAwsCredentials -CurlInvoke $CurlInvoke `
                -WhatIf:$WhatIf
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
