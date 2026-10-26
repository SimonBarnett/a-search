# FR #5096 --- non-2xx /search must non-zero exit; config SearchApiUrl without DescribeStacks
# Pester 3.4 / WinPS 5.1

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path (Split-Path -Parent $here) 'tools'
$scriptPath = Join-Path $tools 'Invoke-FolderSearch.ps1'

function Clear-Fr5096Env {
    foreach ($n in @(
        'A_SEARCH_API_URL',
        'A_SEARCH_SEARCH_API_URL',
        'A_SEARCH_AGENT_API_KEY',
        'A_SEARCH_AGENT_API_KEY_FILE',
        'A_SEARCH_FOLDER_TOOLS_CONFIG',
        'A_SEARCH_STACK_NAME'
    )) {
        Remove-Item "Env:$n" -ErrorAction SilentlyContinue
    }
}

Describe 'FR #5096 Invoke-FolderSearch HTTP status + config URL' {
    $mount = Join-Path $env:TEMP 'fr5096-search-mount'
    $cfgDir = Join-Path $env:TEMP 'fr5096-folder-tools-cfg'

    BeforeEach {
        Clear-Fr5096Env
        if (Test-Path $mount) { Remove-Item -LiteralPath $mount -Recurse -Force -ErrorAction SilentlyContinue }
        if (Test-Path $cfgDir) { Remove-Item -LiteralPath $cfgDir -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') | Out-Null
        New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
    }
    AfterEach {
        Clear-Fr5096Env
    }

    $head = {
        param($b, $k)
        '{"Metadata":{"host":"Original.Host","hostkey":"hostkey1","userid":"user-1"},"ContentLength":0}'
    }
    $tags = { param($b, $k) '{"TagSet":[]}' }
    $getObj = {
        param($b, $k)
        if ($k -match 'searches.json') {
            return '{"queries":[{"q":"brake pads"}],"exclude":[]}'
        }
        return $null
    }

    It 'exits 5 on HTTP 500 and prints status + error (not empty success)' {
        $invoke = {
            param($endpoint, $body, $key, $profile)
            return @{
                StatusCode = 500
                Body       = '{"accepted":false,"ok":false,"error":"internal_error"}'
            }
        }
        $out = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -SearchApiUrl 'https://example.test' -Backend aws -Json `
            -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -InvokeSearch $invoke 2>&1 | ForEach-Object { "$_" }
        $code = $LASTEXITCODE
        $text = ($out | Out-String)
        $code | Should Be 5
        # JSON stdout carries http_status; stderr lines may be ErrorRecords under 2>&1
        $text | Should Match 'http_status.:\s*500'
        $text | Should Match 'internal_error'
        $text | Should Not Match 'secret'
        (Get-Content -LiteralPath $scriptPath -Raw) | Should Match 'search_http_status='
    }

    It 'exits 5 when 2xx body lacks searchid' {
        $invoke = {
            param($endpoint, $body, $key, $profile)
            return @{
                StatusCode = 200
                Body       = '{"accepted":true,"queued":[]}'
            }
        }
        $null = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -SearchApiUrl 'https://example.test' -Backend aws -Json `
            -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -InvokeSearch $invoke 2>&1
        $LASTEXITCODE | Should Be 5
    }

    It 'resolves SearchApiUrl from folder-tools.config.json without env or DescribeStacks' {
        $cfgPath = Join-Path $cfgDir 'folder-tools.config.json'
        # Not EXAMPLE --- Resolve-SearchEndpoint skips EXAMPLE placeholders.
        Set-Content -LiteralPath $cfgPath -Value '{"SearchApiUrl":"https://cfg-from-file.test/a-search","AwsProfile":"a-search-redqueen-annotator"}' -Encoding UTF8
        $calls = @{}
        $invoke = {
            param($endpoint, $body, $key, $profile)
            $calls['endpoint'] = $endpoint
            return @{ StatusCode = 202; Body = '{"searchid":"sid-cfg","queued":["sql"]}' }
        }
        $out = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -ConfigPath $cfgPath -Backend aws -Json `
            -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -InvokeSearch $invoke 2>&1
        $LASTEXITCODE | Should Be 0
        $calls['endpoint'] | Should Be 'https://cfg-from-file.test/a-search'
        ($out | Out-String) | Should Match 'sid-cfg'
    }

    It 'legacy string InvokeSearch body still treated as HTTP 200 success' {
        $out = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -SearchApiUrl 'https://example.test' -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -InvokeSearch { param($e,$b,$k,$p) '{"searchid":"sid-legacy","queued":["sql"]}' } 2>&1
        $LASTEXITCODE | Should Be 0
        ($out | Out-String) | Should Match 'searchid=sid-legacy'
    }
}
