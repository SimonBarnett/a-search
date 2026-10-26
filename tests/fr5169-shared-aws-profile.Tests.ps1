# FR #5169 --- shared AWS profile: flag > search.config.json > annotator; ignore agents env (Pester 3.4).

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path (Split-Path -Parent $here) 'tools'
$searchLib = Join-Path $tools 'Invoke-FolderSearch.ps1'
$folderS3 = Join-Path $tools 'FolderS3.ps1'

Describe 'FR #5169 Resolve-FolderToolsAwsProfile (shared)' {
    BeforeEach {
        . $folderS3
        foreach ($n in @('A_SEARCH_AGENTS_AWS_PROFILE', 'AWS_PROFILE')) {
            Remove-Item "Env:$n" -ErrorAction SilentlyContinue
        }
    }

    It 'prefers -AwsProfile over config and ignores agents env' {
        $env:A_SEARCH_AGENTS_AWS_PROFILE = 'a-search-redqueen-agents'
        $env:AWS_PROFILE = 'shell-login'
        $cfg = [pscustomobject]@{ AwsProfile = 'from-cfg' }
        (Resolve-FolderToolsAwsProfile -AwsProfile 'flag' -Config $cfg) | Should Be 'flag'
        (Resolve-FolderToolsAwsProfile -AwsProfile '' -Config $cfg) | Should Be 'from-cfg'
        (Resolve-FolderToolsAwsProfile -AwsProfile '' -Config $null) | Should Be 'a-search-redqueen-annotator'
    }

    It 'source: search Resolve-AwsProfileName does not read agents env before config' {
        $raw = Get-Content -LiteralPath $searchLib -Raw
        $raw | Should Match 'Resolve-FolderToolsAwsProfile'
        $fn = [regex]::Match($raw, '(?ms)function Resolve-AwsProfileName\s*\{.*?^\}').Value
        $fn | Should Match 'Resolve-FolderToolsAwsProfile'
        $code = [regex]::Replace($fn, '(?m)^\s*#.*$', '')
        $code | Should Not Match 'A_SEARCH_AGENTS_AWS_PROFILE'
        $code | Should Not Match '\$env:AWS_PROFILE'
    }

    It 'search main path does not treat A_SEARCH_AGENTS_AWS_PROFILE as a profile flag' {
        $raw = Get-Content -LiteralPath $searchLib -Raw
        $raw | Should Not Match '\$hasProfileFlag\s*=\s*\[bool\]\$AwsProfile\s*-or\s*\[bool\]\$env:A_SEARCH_AGENTS_AWS_PROFILE'
    }
}

Describe 'FR #5169 search ignores agents env when config has annotator' {
    $mount = Join-Path $env:TEMP 'fr5169-search-mount'
    $cfgDir = Join-Path $env:TEMP 'fr5169-search-cfg'

    BeforeEach {
        foreach ($n in @(
                'A_SEARCH_API_URL', 'A_SEARCH_SEARCH_API_URL', 'A_SEARCH_AGENT_API_KEY',
                'A_SEARCH_AGENT_API_KEY_FILE', 'A_SEARCH_FOLDER_TOOLS_CONFIG', 'A_SEARCH_AGENTS_AWS_PROFILE', 'AWS_PROFILE'
            )) {
            Remove-Item "Env:$n" -ErrorAction SilentlyContinue
        }
        if (Test-Path $mount) { Remove-Item -LiteralPath $mount -Recurse -Force -ErrorAction SilentlyContinue }
        if (Test-Path $cfgDir) { Remove-Item -LiteralPath $cfgDir -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') | Out-Null
        New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
    }

    It 'uses config AwsProfile when A_SEARCH_AGENTS_AWS_PROFILE is agents' {
        $env:A_SEARCH_AGENTS_AWS_PROFILE = 'a-search-redqueen-agents'
        $cfgPath = Join-Path $cfgDir 'search.config.json'
        Set-Content -LiteralPath $cfgPath -Encoding UTF8 -Value (@{
                AwsProfile   = 'a-search-redqueen-annotator'
                SearchApiUrl = 'https://fr5169.example.test'
            } | ConvertTo-Json)
        $calls = @{}
        $head = {
            param($b, $k)
            '{"Metadata":{"host":"Original.Host","hostkey":"hostkey1","userid":"user-1","customernumber":"999"},"ContentLength":0}'
        }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $getObj = {
            param($b, $k)
            if ($k -match 'searches.json') {
                return '{"queries":[{"q":"pads","intent":"parts","maxResults":3}],"exclude":[],"market":"UK","currency":"GBP"}'
            }
            return $null
        }
        $invoke = {
            param($endpoint, $body, $key, $profile)
            $calls['profile'] = $profile
            $calls['endpoint'] = $endpoint
            return '{"searchid":"sid-5169","queued":["sql"]}'
        }
        $out = & $searchLib -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -ConfigPath $cfgPath -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -InvokeSearch $invoke 2>&1
        $LASTEXITCODE | Should Be 0
        $calls['profile'] | Should Be 'a-search-redqueen-annotator'
        $calls['profile'] | Should Not Be 'a-search-redqueen-agents'
        ($out | Out-String) | Should Match 'searchid=sid-5169'
    }
}

Describe 'FR #5169 tools share FolderS3 resolver' {
    $names = @(
        'Get-FolderMeta.ps1',
        'Invoke-FolderSearch.ps1',
        'Invoke-FolderDownload.ps1',
        'Invoke-FolderOnboard.ps1'
    )
    foreach ($n in $names) {
        It "$n uses Resolve-FolderToolsAwsProfile" {
            $raw = Get-Content -LiteralPath (Join-Path $tools $n) -Raw
            $raw | Should Match 'Resolve-FolderToolsAwsProfile'
        }
    }

    It 'FolderS3 defines Resolve-FolderToolsAwsProfile with annotator default' {
        $raw = Get-Content -LiteralPath $folderS3 -Raw
        $raw | Should Match 'function Resolve-FolderToolsAwsProfile'
        $raw | Should Match "return 'a-search-redqueen-annotator'"
        $fn = [regex]::Match($raw, '(?ms)function Resolve-FolderToolsAwsProfile\s*\{.*?^\}').Value
        $code = [regex]::Replace($fn, '(?s)<#.*?#>', '')
        $code = [regex]::Replace($code, '(?m)^\s*#.*$', '')
        $code | Should Not Match 'A_SEARCH_AGENTS_AWS_PROFILE'
        $code | Should Not Match '\$env:AWS_PROFILE'
    }
}
