<#
.SYNOPSIS
POST /search for the a-clubs GUID folder under the mapped S3 drive (FR #4043, FR #4334).

.DESCRIPTION
In a-clubs/{hostkey}/{guid}: reads searches.json and POSTs /search.
Payload matches the annotator: host, hostkey, guid, queries, exclude, plus
market and currency when present, and metadata userid (never customernumber).
Never writes S3. Never prints credentials.
Auth is IAM SigV4 (FR #4888 / #5086); no x-agent-api-key.
FR #5145 / #5169: AwsProfile + SearchApiUrl come from search.config.json next to this
script (or -ConfigPath). Flags override the config. A missing config or missing
value fails loudly; there is no hard-coded fallback URL. Env A_SEARCH_API_URL /
A_SEARCH_SEARCH_API_URL still override when set. Optional CloudFormation stack
output remains a last resort when -AwsProfile is set and the config URL is absent.
Missing searches.json, a non-GUID folder, or a missing URL fails clearly. Non-2xx
/search (or 2xx without searchid) exits 5 and prints http status/error (FR #5096).
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
JSON config with SearchApiUrl and AwsProfile (search.config.json by default).
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
. (Join-Path $here 'FolderProgress.ps1')
. (Join-Path $here 'ToolFailure.ps1')

function Get-FolderToolsConfig {
    param([string]$ConfigPath)
    # FR #5145: explicit -ConfigPath that is missing fails loudly (no silent sibling fallback).
    if ($ConfigPath) {
        if (-not (Test-Path -LiteralPath $ConfigPath)) {
            throw ("search_config_missing: -ConfigPath not found: {0}" -f $ConfigPath)
        }
        $script:FolderToolsConfigPath = $ConfigPath
        return (Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json)
    }
    $candidates = @()
    if ($env:A_SEARCH_FOLDER_TOOLS_CONFIG) { $candidates += $env:A_SEARCH_FOLDER_TOOLS_CONFIG }
    # FR #5145: command config next to search.ps1 / Invoke-FolderSearch.ps1
    $candidates += (Join-Path $here 'search.config.json')
    $candidates += (Join-Path $here 'folder-tools.config.json')
    $candidates += (Join-Path $env:ProgramData 'a-search\folder-tools.config.json')
    foreach ($c in $candidates) {
        if ($c -and (Test-Path -LiteralPath $c)) {
            $script:FolderToolsConfigPath = $c
            return (Get-Content -LiteralPath $c -Raw -Encoding UTF8 | ConvertFrom-Json)
        }
    }
    $script:FolderToolsConfigPath = $null
    return $null
}


function Get-ConfigProperty {
    param($Config, [string]$Name)
    if (-not $Config) { return $null }
    $prop = $Config.PSObject.Properties[$Name]
    if (-not $prop) { return $null }
    return $prop.Value
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
    $cfgUrl = Get-ConfigProperty -Config $Config -Name 'SearchApiUrl'
    if ($cfgUrl) {
        $fromCfg = ([string]$cfgUrl).Trim()
        # FR #5145: reject uppercase EXAMPLE placeholder only (case-sensitive);
        # allow hostnames like config.example.test
        if ($fromCfg -and $fromCfg -cnotmatch 'EXAMPLE') { return $fromCfg.TrimEnd('/') }
    }
    # FR #5086: optional stack output when aws CLI can describe ASearchStack
    $stackName = 'ASearchStack'
    $cfgStack = Get-ConfigProperty -Config $Config -Name 'SearchStackName'
    if ($cfgStack) { $stackName = [string]$cfgStack }
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
    throw 'search_api_url_required: set -SearchApiUrl, A_SEARCH_API_URL, A_SEARCH_SEARCH_API_URL, or SearchApiUrl in search.config.json (FR #5145); no hard-coded fallback URL'
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
    $cfgKeyEnv = Get-ConfigProperty -Config $Config -Name 'AgentApiKeyEnv'
    if ($cfgKeyEnv) { $envName = [string]$cfgKeyEnv }
    $v = [Environment]::GetEnvironmentVariable($envName)
    if ($v) { return $v }
    return ''
}

function Resolve-AwsProfileName {
    # FR #5169: shared resolver — flag > config > annotator; ignore agents/AWS_PROFILE env.
    param($Config, [string]$AwsProfile)
    return (Resolve-FolderToolsAwsProfile -AwsProfile $AwsProfile -Config $Config)
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
        # FR #5157: spinner while export-credentials waits on AWS.
        $doc = Invoke-FolderToolWithSpinner -Label ("aws export-credentials --profile {0}" -f $ProfileName) -ArgumentList @($ProfileName) -ScriptBlock {
            param($profileName)
            $raw = & aws configure export-credentials --profile $profileName --format process 2>&1
            $code = $LASTEXITCODE
            if ($code -ne 0) {
                throw ("aws_credentials_failed: export-credentials exit {0}" -f $code)
            }
            $text = (($raw | Out-String) -replace '[\u0000-\u0008\u000B\u000C\u000E-\u001F]', '').Trim()
            try {
                return ($text | ConvertFrom-Json)
            }
            catch {
                throw 'aws_credentials_failed: export-credentials JSON parse failed'
            }
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

function ConvertTo-SearchHttpResult {
    param($Raw)
    # FR #5096: normalise injectable / curl results to StatusCode + Body.
    # Legacy string body => HTTP 200. Hashtable/PSCustomObject with StatusCode/Body preferred.
    if ($null -eq $Raw) {
        return @{ StatusCode = 0; Body = '' }
    }
    if ($Raw -is [hashtable]) {
        $code = 200
        if ($Raw.ContainsKey('StatusCode') -and $Raw['StatusCode']) { $code = [int]$Raw['StatusCode'] }
        $body = ''
        if ($Raw.ContainsKey('Body')) { $body = [string]$Raw['Body'] }
        elseif ($Raw.ContainsKey('Content')) { $body = [string]$Raw['Content'] }
        return @{ StatusCode = $code; Body = $body }
    }
    if ($Raw -is [System.Management.Automation.PSObject] -and
        ($Raw.PSObject.Properties['StatusCode'] -or $Raw.PSObject.Properties['statusCode'])) {
        $codeProp = $Raw.PSObject.Properties['StatusCode']
        if (-not $codeProp) { $codeProp = $Raw.PSObject.Properties['statusCode'] }
        $bodyProp = $Raw.PSObject.Properties['Body']
        if (-not $bodyProp) { $bodyProp = $Raw.PSObject.Properties['Content'] }
        $code = if ($codeProp -and $codeProp.Value) { [int]$codeProp.Value } else { 200 }
        $body = if ($bodyProp -and $null -ne $bodyProp.Value) { [string]$bodyProp.Value } else { '' }
        return @{ StatusCode = $code; Body = $body }
    }
    if ($Raw -is [System.Array]) {
        if (@($Raw).Count -eq 1) { $text = [string](@($Raw)[0]) }
        else { $text = ((@($Raw) | ForEach-Object { [string]$_ }) -join [char]10) }
    }
    else { $text = [string]$Raw }
    # curl -w marker (FR #5096)
    $marker = '__HTTP_STATUS__:'
    $idx = $text.LastIndexOf($marker)
    if ($idx -ge 0) {
        $body = $text.Substring(0, $idx).TrimEnd([char]13, [char]10)
        $tail = $text.Substring($idx + $marker.Length).Trim()
        $code = 0
        if ($tail -match '^(\d{3})') { $code = [int]$Matches[1] }
        return @{ StatusCode = $code; Body = $body }
    }
    return @{ StatusCode = 200; Body = $text.Trim() }
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
        return (ConvertTo-SearchHttpResult (& $InvokeSearch $Endpoint $Body $AgentApiKey $AwsProfile))
    }
    # Prefer curl.exe with --aws-sigv4 when profile is set (FR #4888 / #5078 / #5086).
    # Do not send x-agent-api-key --- gateway IAM is the only auth.
    $uri = "$Endpoint/search"
    $json = $Body | ConvertTo-Json -Compress -Depth 8
    # Never log headers/body with secrets --- Write-Verbose only endpoint + hostkey/guid
    Write-Verbose ("POST {0} hostkey={1} guid={2}" -f $uri, $Body.hostkey, $Body.guid)

    if (-not $AwsProfile) {
        throw 'aws_profile_required: IAM SigV4 needs -AwsProfile or AwsProfile in search.config.json (FR #5145)'
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
        # FR #5096: capture HTTP status (curl -f would drop the body on 4xx/5xx).
        $curlArgs += @('--data-binary', ('@{0}' -f $tmp), '-w', "`n__HTTP_STATUS__:%{http_code}")
        if ($CurlInvoke) {
            $out = & $CurlInvoke $curlArgs
        }
        else {
            # FR #5157 / #5160: spinner around SigV4 POST /search.
            # Pass --user and x-amz-security-token via process env (not job argv).
            $prevCurlUser = [Environment]::GetEnvironmentVariable('A_SEARCH_SEARCH_CURL_USER', 'Process')
            $prevCurlTok = [Environment]::GetEnvironmentVariable('A_SEARCH_SEARCH_CURL_SESSION_TOKEN', 'Process')
            [Environment]::SetEnvironmentVariable('A_SEARCH_SEARCH_CURL_USER', $userPair, 'Process')
            if ($creds.SessionToken) {
                [Environment]::SetEnvironmentVariable('A_SEARCH_SEARCH_CURL_SESSION_TOKEN', [string]$creds.SessionToken, 'Process')
            }
            else {
                [Environment]::SetEnvironmentVariable('A_SEARCH_SEARCH_CURL_SESSION_TOKEN', $null, 'Process')
            }
            try {
                $curlArgsJob = @($curlArgs)
                # Strip --user <pair> and -H x-amz-security-token:* from job args; job re-adds from env.
                $stripped = New-Object System.Collections.Generic.List[string]
                for ($i = 0; $i -lt $curlArgsJob.Count; $i++) {
                    if ($curlArgsJob[$i] -eq '--user' -and ($i + 1) -lt $curlArgsJob.Count) {
                        $i++
                        continue
                    }
                    if ($curlArgsJob[$i] -eq '-H' -and ($i + 1) -lt $curlArgsJob.Count) {
                        $hdr = [string]$curlArgsJob[$i + 1]
                        if ($hdr.StartsWith('x-amz-security-token:', [System.StringComparison]::OrdinalIgnoreCase)) {
                            $i++
                            continue
                        }
                    }
                    [void]$stripped.Add([string]$curlArgsJob[$i])
                }
                $out = Invoke-FolderToolWithSpinner -Label ("POST /search {0}" -f $uri) -ArgumentList @(,$stripped.ToArray()) -ScriptBlock {
                    param($cargs)
                    $u = [Environment]::GetEnvironmentVariable('A_SEARCH_SEARCH_CURL_USER', 'Process')
                    if (-not $u) { throw 'search_http_failed: missing curl user env' }
                    $full = [System.Collections.Generic.List[string]]@($cargs)
                    [void]$full.Add('--user')
                    [void]$full.Add($u)
                    $tok = [Environment]::GetEnvironmentVariable('A_SEARCH_SEARCH_CURL_SESSION_TOKEN', 'Process')
                    if ($tok) {
                        [void]$full.Add('-H')
                        [void]$full.Add(('x-amz-security-token: {0}' -f $tok))
                    }
                    $o = & curl.exe @($full.ToArray()) 2>&1
                    if ($LASTEXITCODE -ne 0) { throw ("search_http_failed: curl exit {0}" -f $LASTEXITCODE) }
                    return $o
                }
            }
            finally {
                if ($null -eq $prevCurlUser) {
                    [Environment]::SetEnvironmentVariable('A_SEARCH_SEARCH_CURL_USER', $null, 'Process')
                }
                else {
                    [Environment]::SetEnvironmentVariable('A_SEARCH_SEARCH_CURL_USER', $prevCurlUser, 'Process')
                }
                if ($null -eq $prevCurlTok) {
                    [Environment]::SetEnvironmentVariable('A_SEARCH_SEARCH_CURL_SESSION_TOKEN', $null, 'Process')
                }
                else {
                    [Environment]::SetEnvironmentVariable('A_SEARCH_SEARCH_CURL_SESSION_TOKEN', $prevCurlTok, 'Process')
                }
            }
        }
        return (ConvertTo-SearchHttpResult $out)
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

    $http = Invoke-AgentSearchHttp -Endpoint $Endpoint -Body $body `
        -AgentApiKey $AgentApiKey -AwsProfile $AwsProfile -InvokeSearch $InvokeSearch `
        -ResolveAwsCredentials $ResolveAwsCredentials -CurlInvoke $CurlInvoke

    $rawBody = [string]$http.Body
    $parsed = $null
    try { $parsed = ConvertFrom-FolderS3Json $rawBody } catch { $parsed = $rawBody }

    [pscustomobject]@{
        hostkey     = $hostkey
        host        = $hostForApi
        guid        = $guid
        queries     = $sq.queries
        userid      = $userid
        body        = $body
        whatif      = $false
        httpStatus  = [int]$http.StatusCode
        response    = $parsed
        rawBody     = $rawBody
    }
}

try {
    $target = if ($Path) { $Path } else { (Get-Location).Path }
    Write-FolderToolStep ("search starting path={0}" -f $target)
    $loc = ConvertTo-FolderS3Location -Path $target -MountRoot $MountRoot
    Write-FolderToolStep ("Resolved s3://{0}/{1} kind={2}" -f $loc.Bucket, $loc.Key, $loc.Kind)

    if ($loc.Bucket.ToLowerInvariant() -ne 'a-clubs') {
        [Console]::Error.WriteLine("not_a_clubs: Invoke-FolderSearch only works under a-clubs host/GUID folders (got bucket=$($loc.Bucket) kind=$($loc.Kind))")
        exit 3
    }
    if ($loc.Kind -notin @('host', 'guid')) {
        [Console]::Error.WriteLine("not_guid_folder: not_host_or_guid: kind=$($loc.Kind); run inside a-clubs/{hostkey}/{guid}")
        exit 3
    }

    $cfg = Get-FolderToolsConfig -ConfigPath $ConfigPath
    # FR #5145: when caller did not pass URL/profile/env, require a command config file.
    $hasUrlFlag = [bool]$SearchApiUrl -or [bool]$env:A_SEARCH_API_URL -or [bool]$env:A_SEARCH_SEARCH_API_URL
    if (-not $cfg -and -not $hasUrlFlag) {
        throw 'search_config_missing: need search.config.json next to the command (or -ConfigPath) with AwsProfile and SearchApiUrl (FR #5145)'
    }
    Write-FolderToolStep 'Resolving AwsProfile and SearchApiUrl'
    $profile = Resolve-AwsProfileName -Config $cfg -AwsProfile $AwsProfile
    $endpoint = Resolve-SearchEndpoint -Config $cfg -SearchApiUrl $SearchApiUrl -AwsProfile $profile
    Write-FolderToolStep ("Using profile={0} endpoint={1}" -f $profile, $endpoint)
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

    # Print results without credentials. FR #5096: non-2xx or missing searchid => exit 5.
    $searchFailed = $false
    foreach ($r in $results) {
        $queryCount = @($r.queries).Count
        $providers = ''
        $searchId = ''
        $errMsg = ''
        if ($r.response -and -not ($r.response -is [string])) {
            $sidProp = $r.response.PSObject.Properties['searchid']
            if ($sidProp -and $sidProp.Value) { $searchId = [string]$sidProp.Value }
            $qProp = $r.response.PSObject.Properties['queued']
            if ($qProp -and $qProp.Value) { $providers = (@($qProp.Value) -join ',') }
            foreach ($ename in @('error', 'message', 'Message')) {
                $ep = $r.response.PSObject.Properties[$ename]
                if ($ep -and $ep.Value) { $errMsg = [string]$ep.Value; break }
            }
        }
        if ($r.whatif) {
            Write-Output 'whatif=1'
            Write-Output ($r.body | ConvertTo-Json -Compress -Depth 8)
            Write-Output '---'
            continue
        }
        $status = 0
        if ($r.PSObject.Properties['httpStatus'] -and $r.httpStatus) { $status = [int]$r.httpStatus }
        $badHttp = ($status -lt 200 -or $status -ge 300)
        if ($badHttp -or -not $searchId) {
            $searchFailed = $true
            if ($badHttp) {
                [Console]::Error.WriteLine(("search_http_status={0}" -f $status))
            }
            else {
                [Console]::Error.WriteLine('searchid_missing')
            }
            if ($errMsg) {
                $safeErr = $errMsg -replace '(?i)(api[_-]?key|token|password|secret)\s*[:=]\s*\S+', '$1=***'
                [Console]::Error.WriteLine(("search_error={0}" -f $safeErr))
            }
            elseif ($r.PSObject.Properties['rawBody'] -and $r.rawBody) {
                $safeBody = ([string]$r.rawBody) -replace '(?i)(api[_-]?key|token|password|secret)\s*[:=]\s*\S+', '$1=***'
                if ($safeBody.Length -gt 500) { $safeBody = $safeBody.Substring(0, 500) + '...' }
                [Console]::Error.WriteLine(("search_body={0}" -f $safeBody))
            }
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
                http_status       = $status
            }
            if ($errMsg) {
                $doc['error'] = ($errMsg -replace '(?i)(api[_-]?key|token|password|secret)\s*[:=]\s*\S+', '$1=***')
            }
            Write-Output ($doc | ConvertTo-Json -Compress -Depth 6)
            continue
        }
        Write-Output ("host={0} hostkey={1} guid={2}" -f $r.host, $r.hostkey, $r.guid)
        Write-Output ("queries={0}" -f (($r.queries | ConvertTo-Json -Compress -Depth 5)))
        Write-Output ("query_count={0}" -f $queryCount)
        if ($status) { Write-Output ("http_status={0}" -f $status) }
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
    if ($searchFailed) { exit 5 }
    exit 0
}
catch {
    $msg = $_.Exception.Message
    # Never echo secrets if a key accidentally landed in the message
    $safe = $msg -replace '(?i)(api[_-]?key|token|password|secret)\s*[:=]\s*\S+', '$1=***'
    [Console]::Error.WriteLine($safe)
    if ($safe -match '^path_outside_mount') {
    $detailForIssue = $null
    if (Get-Variable -Name safe -Scope 0 -ErrorAction SilentlyContinue) { $detailForIssue = $safe }
    elseif (Get-Variable -Name msg -Scope 0 -ErrorAction SilentlyContinue) { $detailForIssue = $msg }
    else { $detailForIssue = $_.Exception.Message }
    $exitForIssue = 1
    if ($detailForIssue -match '^path_outside_mount') { $exitForIssue = 2 }
    elseif ($detailForIssue -match '^bucket_root') { $exitForIssue = 5 }
    $s3ForIssue = ''; if (Get-Variable -Name loc -Scope 0 -ErrorAction SilentlyContinue) { if ($null -ne $loc) { $s3ForIssue = ('s3://{0}/{1}' -f $loc.Bucket, $loc.Key) } }
    if ($exitForIssue -notin @(2, 3, 4, 5)) {
    $cwdForIssue = ''
    if (Get-Variable -Name Path -Scope 0 -ErrorAction SilentlyContinue) { $cwdForIssue = [string]$Path }
    Invoke-ASearchToolFailureReport -Tool 'search' -ErrorCode 'error' -Detail ([string]$detailForIssue) -ExitCode $exitForIssue -Cwd $cwdForIssue -S3Uri ([string]$s3ForIssue) -CommandLine ([string]$MyInvocation.Line)
    }

        exit 2
    }
    exit 1
}
