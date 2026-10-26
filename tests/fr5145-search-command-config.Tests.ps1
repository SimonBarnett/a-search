# FR #5145 --- search command config (AwsProfile + SearchApiUrl); flag override; missing config.
# Pester 3.4 / WinPS 5.1. Never print credentials. No live /search.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path (Split-Path -Parent $here) 'tools'
$scriptPath = Join-Path $tools 'Invoke-FolderSearch.ps1'

function Clear-Fr5145SearchEnv {
    foreach ($n in @(
        'A_SEARCH_API_URL',
        'A_SEARCH_SEARCH_API_URL',
        'A_SEARCH_AGENT_API_KEY',
        'A_SEARCH_AGENT_API_KEY_FILE',
        'A_SEARCH_FOLDER_TOOLS_CONFIG',
        'A_SEARCH_AGENTS_AWS_PROFILE'
    )) {
        Remove-Item "Env:$n" -ErrorAction SilentlyContinue
    }
}

Describe 'FR #5145 search command config' {
    $mount = Join-Path $env:TEMP 'fr5145-search-mount'
    $cfgDir = Join-Path $env:TEMP 'fr5145-search-cfg'

    BeforeEach {
        Clear-Fr5145SearchEnv
        if (Test-Path $mount) { Remove-Item -LiteralPath $mount -Recurse -Force -ErrorAction SilentlyContinue }
        if (Test-Path $cfgDir) { Remove-Item -LiteralPath $cfgDir -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') | Out-Null
        New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
    }
    AfterEach {
        Clear-Fr5145SearchEnv
    }

    $head = {
        param($b, $k)
        '{"Metadata":{"host":"Original.Host","hostkey":"hostkey1","userid":"user-1","customernumber":"999"},"ContentLength":0}'
    }
    $tags = { param($b, $k) '{"TagSet":[]}' }
    $getObj = {
        param($b, $k)
        if ($k -match 'searches.json') {
            return '{"queries":[{"q":"brake pads","intent":"parts","maxResults":3}],"exclude":["oem"],"market":"UK","currency":"GBP"}'
        }
        return $null
    }

    It 'reads AwsProfile and SearchApiUrl from -ConfigPath' {
        $cfgPath = Join-Path $cfgDir 'search.config.json'
        Set-Content -LiteralPath $cfgPath -Encoding UTF8 -Value (@{
            AwsProfile = 'profile-from-config'
            SearchApiUrl = 'https://config.example.test'
        } | ConvertTo-Json)
        $calls = @{}
        $invoke = {
            param($endpoint, $body, $key, $profile)
            $calls['endpoint'] = $endpoint
            $calls['profile'] = $profile
            return '{"searchid":"sid-cfg","queued":["sql"]}'
        }
        $out = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -ConfigPath $cfgPath -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -InvokeSearch $invoke 2>&1
        $LASTEXITCODE | Should Be 0
        $calls['endpoint'] | Should Be 'https://config.example.test'
        $calls['profile'] | Should Be 'profile-from-config'
        ($out | Out-String) | Should Match 'searchid=sid-cfg'
    }

    It 'flag -SearchApiUrl and -AwsProfile override config' {
        $cfgPath = Join-Path $cfgDir 'search.config.json'
        Set-Content -LiteralPath $cfgPath -Encoding UTF8 -Value (@{
            AwsProfile = 'profile-from-config'
            SearchApiUrl = 'https://config.example.test'
        } | ConvertTo-Json)
        $calls = @{}
        $invoke = {
            param($endpoint, $body, $key, $profile)
            $calls['endpoint'] = $endpoint
            $calls['profile'] = $profile
            return '{"searchid":"sid-flag","queued":["amazon"]}'
        }
        $null = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -ConfigPath $cfgPath -SearchApiUrl 'https://flag.example.test/' -AwsProfile 'profile-from-flag' `
            -Backend aws -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -InvokeSearch $invoke 2>&1
        $LASTEXITCODE | Should Be 0
        $calls['endpoint'] | Should Be 'https://flag.example.test'
        $calls['profile'] | Should Be 'profile-from-flag'
    }

    It 'missing -ConfigPath fails with search_config_missing' {
        $missing = Join-Path $cfgDir 'does-not-exist.json'
        # Console.Error.WriteLine bypasses PowerShell 2>&1; assert exit + source message (FR #5096 pattern).
        $null = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -ConfigPath $missing -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -InvokeSearch { param($e,$b,$k,$p) '{"searchid":"nope"}' } 2>&1
        $LASTEXITCODE | Should Not Be 0
        (Get-Content -LiteralPath $scriptPath -Raw) | Should Match 'search_config_missing'
    }

    It 'shipped tools/search.config.json has redqueen profile and URL (no secrets)' {
        $shipped = Join-Path $tools 'search.config.json'
        Test-Path -LiteralPath $shipped | Should Be $true
        $j = Get-Content -LiteralPath $shipped -Raw -Encoding UTF8 | ConvertFrom-Json
        $j.AwsProfile | Should Be 'a-search-redqueen-annotator'
        $j.SearchApiUrl | Should Match 'axy0jgpkee.execute-api.eu-west-2.amazonaws.com'
        $raw = Get-Content -LiteralPath $shipped -Raw -Encoding UTF8
        $raw | Should Not Match '(?i)(secret|password|token|AKIA)'
    }

    It 'Install-SearchCommand.ps1 copies shim and keeps existing config' {
        $install = Join-Path $tools 'Install-SearchCommand.ps1'
        Test-Path -LiteralPath $install | Should Be $true
        $dest = Join-Path $env:TEMP 'fr5145-tools-install'
        if (Test-Path $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
        New-Item -ItemType Directory -Force -Path $dest | Out-Null
        Set-Content -LiteralPath (Join-Path $dest 'search.config.json') -Encoding UTF8 -Value '{"AwsProfile":"kept-profile","SearchApiUrl":"https://kept.example.test"}'
        & $install -ToolsDir $dest -SkipPath | Out-Null
        $LASTEXITCODE | Should Be 0
        Test-Path (Join-Path $dest 'search.ps1') | Should Be $true
        Test-Path (Join-Path $dest 'search.cmd') | Should Be $true
        Test-Path (Join-Path $dest 'Invoke-FolderSearch.ps1') | Should Be $true
        Test-Path (Join-Path $dest 'FolderS3.ps1') | Should Be $true
        $kept = Get-Content (Join-Path $dest 'search.config.json') -Raw | ConvertFrom-Json
        $kept.AwsProfile | Should Be 'kept-profile'
        $kept.SearchApiUrl | Should Be 'https://kept.example.test'
    }

    It 'GUID folder still works with injected InvokeSearch (regression)' {
        $out = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -SearchApiUrl 'https://example.test' -AwsProfile 'test-profile' -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -InvokeSearch { param($e,$b,$k,$p) '{"searchid":"sid-reg","queued":["sql"]}' } 2>&1
        $LASTEXITCODE | Should Be 0
        ($out | Out-String) | Should Match 'searchid=sid-reg'
    }

    It 'host folder -All still works (regression)' {
        $guid2 = Join-Path $mount 'a-clubs\hostkey1\guid-bbb'
        New-Item -ItemType Directory -Force -Path $guid2 | Out-Null
        $ids = New-Object System.Collections.Generic.List[string]
        $invoke = {
            param($endpoint, $body, $key, $profile)
            $ids.Add([string]$body.guid) | Out-Null
            return ('{"searchid":"sid-' + $body.guid + '","queued":["sql"]}')
        }
        $hostHead = {
            param($b, $k)
            '{"Metadata":{"host":"Original.Host","hostkey":"hostkey1","userid":"user-1"},"ContentLength":0}'
        }
        $null = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1') -MountRoot $mount -All `
            -SearchApiUrl 'https://example.test' -AwsProfile 'test-profile' -Backend aws `
            -AwsHeadObject $hostHead -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -InvokeSearch $invoke 2>&1
        $LASTEXITCODE | Should Be 0
        $ids.Count | Should Be 2
    }
}
