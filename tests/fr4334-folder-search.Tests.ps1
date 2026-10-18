# FR #4334 --- search command gaps (Pester 3.4 / WinPS 5.1)
# Env alignment, searches.json payload, missing file, -Json, -WhatIf. Never print the key.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path (Split-Path -Parent $here) 'tools'
$scriptPath = Join-Path $tools 'Invoke-FolderSearch.ps1'

function Clear-Fr4334SearchEnv {
    foreach ($n in @(
        'A_SEARCH_API_URL',
        'A_SEARCH_SEARCH_API_URL',
        'A_SEARCH_AGENT_API_KEY',
        'A_SEARCH_AGENT_API_KEY_FILE',
        'A_SEARCH_FOLDER_TOOLS_CONFIG'
    )) {
        Remove-Item "Env:$n" -ErrorAction SilentlyContinue
    }
}

Describe 'FR #4334 Invoke-FolderSearch gaps' {
    $mount = Join-Path $env:TEMP 'fr4334-search-mount'
    $keyFile = Join-Path $env:TEMP 'fr4334-agent-key.txt'

    BeforeEach {
        Clear-Fr4334SearchEnv
        if (Test-Path $mount) { Remove-Item -LiteralPath $mount -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') | Out-Null
        [System.IO.File]::WriteAllText($keyFile, "FAKE_FILE_KEY`n")
    }
    AfterEach {
        Clear-Fr4334SearchEnv
        if (Test-Path $keyFile) { Remove-Item -LiteralPath $keyFile -Force -ErrorAction SilentlyContinue }
    }

    $head = {
        param($b, $k)
        '{"Metadata":{"host":"Original.Host","hostkey":"hostkey1","userid":"user-1","customernumber":"999"},"ContentLength":0}'
    }
    $tags = { param($b, $k) '{"TagSet":[]}' }
    $getObj = {
        param($b, $k)
        if ($k -match 'searches.json') {
            return '{"queries":[{"q":"brake pads","intent":"parts","maxResults":3}],"exclude":["oem"],"market":"UK","currency":"GBP","customernumber":"999"}'
        }
        return $null
    }

    It 'sends market currency and userid and never customernumber' {
        $env:A_SEARCH_API_URL = 'https://example.test/'
        $env:A_SEARCH_AGENT_API_KEY_FILE = $keyFile
        $calls = @{}
        $invoke = {
            param($endpoint, $body, $key, $profile)
            $calls['body'] = $body
            $calls['key'] = $key
            $calls['endpoint'] = $endpoint
            return '{"searchid":"sid-9","queued":["amazon","ebay","sql"]}'
        }
        $out = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -Backend aws -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -InvokeSearch $invoke 2>&1
        $LASTEXITCODE | Should Be 0
        $calls['endpoint'] | Should Be 'https://example.test'
        $calls['key'] | Should Be 'FAKE_FILE_KEY'
        $calls['body'].market | Should Be 'UK'
        $calls['body'].currency | Should Be 'GBP'
        $calls['body'].userid | Should Be 'user-1'
        $calls['body'].ContainsKey('customernumber') | Should Be $false
        $text = ($out | Out-String)
        $text | Should Match 'searchid=sid-9'
        $text | Should Match 'query_count=1'
        $text | Should Match 'providers_queued=amazon,ebay,sql'
        $text | Should Not Match 'FAKE_FILE_KEY'
    }

    It 'fails when searches.json is missing' {
        $env:A_SEARCH_AGENT_API_KEY = 'FAKE_AGENT_KEY_FOR_TEST'
        $missing = { param($b, $k) return $null }
        $null = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -SearchApiUrl 'https://example.test' -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $missing `
            -InvokeSearch { param($e,$b,$k,$p) '{"searchid":"nope"}' } 2>&1
        $LASTEXITCODE | Should Be 1
        (Get-Content -LiteralPath $scriptPath -Raw) | Should Match 'searches_json_missing'
    }

    It 'fails when the key is not configured' {
        $null = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -SearchApiUrl 'https://example.test' -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -InvokeSearch { param($e,$b,$k,$p) '{}' } 2>&1
        $LASTEXITCODE | Should Be 1
    }

    It 'WhatIf prints the payload and does not post' {
        $env:A_SEARCH_AGENT_API_KEY = 'FAKE_AGENT_KEY_FOR_TEST'
        $flag = @{ called = $false }
        $out = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -SearchApiUrl 'https://example.test' -Backend aws -WhatIf `
            -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -InvokeSearch { param($e,$b,$k,$p) $flag.called = $true; '{}' } 2>&1
        $LASTEXITCODE | Should Be 0
        $flag.called | Should Be $false
        $text = ($out | Out-String)
        $text | Should Match 'whatif=1'
        $text | Should Match 'brake pads'
        $text | Should Match 'GBP'
        $text | Should Not Match 'FAKE_AGENT_KEY'
    }

    It 'Json output includes searchid and query_count and not the key' {
        $env:A_SEARCH_AGENT_API_KEY = 'FAKE_AGENT_KEY_FOR_TEST'
        $out = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -SearchApiUrl 'https://example.test' -Backend aws -Json `
            -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -InvokeSearch { param($e,$b,$k,$p) '{"searchid":"sid-j","queued":["amazon"]}' } 2>&1
        $LASTEXITCODE | Should Be 0
        $text = ($out | Out-String)
        $text | Should Not Match 'FAKE_AGENT_KEY'
        $doc = $text | ConvertFrom-Json
        $doc.searchid | Should Be 'sid-j'
        $doc.query_count | Should Be 1
        $doc.userid | Should Be 'user-1'
        $doc.providers_queued | Should Be 'amazon'
    }
}
