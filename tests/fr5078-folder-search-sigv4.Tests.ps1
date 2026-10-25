# FR #5078 --- SigV4 uses resolved credentials, never the profile name (Pester 3.4 / WinPS 5.1)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path (Split-Path -Parent $here) 'tools'
$scriptPath = Join-Path $tools 'Invoke-FolderSearch.ps1'

Describe 'FR #5078 Invoke-FolderSearch SigV4 credentials' {
    $mount = Join-Path $env:TEMP 'fr5078-search-mount'
    $keyFile = Join-Path $env:TEMP 'fr5078-agent-key.txt'

    BeforeEach {
        if (Test-Path $mount) { Remove-Item -LiteralPath $mount -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') | Out-Null
        [System.IO.File]::WriteAllText($keyFile, "FAKE_FILE_KEY`n")
        $env:A_SEARCH_AGENT_API_KEY_FILE = $keyFile
        $env:A_SEARCH_API_URL = 'https://example.test/'
    }
    AfterEach {
        Remove-Item Env:A_SEARCH_AGENT_API_KEY_FILE -ErrorAction SilentlyContinue
        Remove-Item Env:A_SEARCH_API_URL -ErrorAction SilentlyContinue
        if (Test-Path $keyFile) { Remove-Item -LiteralPath $keyFile -Force -ErrorAction SilentlyContinue }
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

    It 'curl --user is AccessKeyId:Secret not the profile name; session token header when present' {
        $captured = @{ args = $null; profile = $null }
        $resolve = {
            param($profileName)
            $captured.profile = $profileName
            ,@{
                AccessKeyId     = 'FAKEACCESSKEYIDEXAMPLE'
                SecretAccessKey = 'FAKESECRETKEYEXAMPLE000'
                SessionToken    = 'FAKESESSIONTOKENEXAMPLE'
            }
        }
        $curl = {
            param($curlArgs)
            $captured.args = @($curlArgs)
            ,'{"searchid":"sid-sigv4","queued":["amazon"]}'
        }
        $out = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -Backend aws -AwsProfile 'fake-annotator-profile' `
            -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -ResolveAwsCredentials $resolve -CurlInvoke $curl 2>&1
        $LASTEXITCODE | Should Be 0
        $captured.profile | Should Be 'fake-annotator-profile'
        $captured.args | Should Not Be $null
        $joined = [string]::Join(' ', @($captured.args))
        $joined | Should Match '--aws-sigv4'
        $joined | Should Match 'FAKEACCESSKEYIDEXAMPLE:FAKESECRETKEYEXAMPLE000'
        $joined | Should Not Match 'fake-annotator-profile:'
        $joined | Should Match 'x-amz-security-token: FAKESESSIONTOKENEXAMPLE'
        $text = ($out | Out-String)
        $text | Should Match 'searchid=sid-sigv4'
        $text | Should Not Match 'FAKEACCESSKEYIDEXAMPLE'
        $text | Should Not Match 'FAKESECRETKEYEXAMPLE'
        $text | Should Not Match 'FAKESESSIONTOKENEXAMPLE'
        $text | Should Not Match 'FAKE_FILE_KEY'
    }

    It 'fails clearly when credential resolver returns no AccessKeyId' {
        $resolve = {
            param($profileName)
            return @{ AccessKeyId = ''; SecretAccessKey = 'x'; SessionToken = '' }
        }
        $curl = { param($a) throw 'curl_should_not_run' }
        $null = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -Backend aws -AwsProfile 'broken-profile' `
            -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -ResolveAwsCredentials $resolve -CurlInvoke $curl 2>&1
        $LASTEXITCODE | Should Be 1
    }
}