# FR #4043 --- Get-FolderMeta + Invoke-FolderSearch (Pester 3.4 / WinPS 5.1)
$ErrorActionPreference = 'Stop'
# FR #5151 / MRB #5154: never file intake from folder-tool Pester mounts
$env:A_SEARCH_TOOL_FAILURE_DISABLE = '1'
$tools = Join-Path (Split-Path $PSScriptRoot -Parent) 'tools'
. (Join-Path $tools 'FolderS3.ps1')

Describe 'ConvertTo-FolderS3Location mapping' {
    $mount = Join-Path $env:TEMP 'fr4043-mount-root'
    BeforeEach {
        if (Test-Path $mount) { Remove-Item -LiteralPath $mount -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-clubs\host1\guid1') | Out-Null
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-affiliates\awin\aff1') | Out-Null
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-merchants\shopify\m1') | Out-Null
    }

    It 'maps host folder' {
        $loc = ConvertTo-FolderS3Location -Path (Join-Path $mount 'a-clubs\host1') -MountRoot $mount
        $loc.Bucket | Should Be 'a-clubs'
        $loc.Key | Should Be 'host1/'
        $loc.Kind | Should Be 'host'
    }

    It 'maps GUID folder' {
        $loc = ConvertTo-FolderS3Location -Path (Join-Path $mount 'a-clubs\host1\guid1') -MountRoot $mount
        $loc.Bucket | Should Be 'a-clubs'
        $loc.Key | Should Be 'host1/guid1/'
        $loc.Kind | Should Be 'guid'
    }

    It 'maps provider affiliate merchant' {
        $p = ConvertTo-FolderS3Location -Path (Join-Path $mount 'a-affiliates\awin') -MountRoot $mount
        $p.Kind | Should Be 'provider'
        $a = ConvertTo-FolderS3Location -Path (Join-Path $mount 'a-affiliates\awin\aff1') -MountRoot $mount
        $a.Kind | Should Be 'affiliate'
        $m = ConvertTo-FolderS3Location -Path (Join-Path $mount 'a-merchants\shopify\m1') -MountRoot $mount
        $m.Kind | Should Be 'merchant'
        $mp = ConvertTo-FolderS3Location -Path (Join-Path $mount 'a-merchants\shopify') -MountRoot $mount
        $mp.Kind | Should Be 'provider'
    }

    It 'throws outside mount' {
        $threw = $false
        try {
            ConvertTo-FolderS3Location -Path 'C:\Windows' -MountRoot $mount | Out-Null
        } catch {
            $threw = $true
            $_.Exception.Message | Should Match 'path_outside_mount'
        }
        $threw | Should Be $true
    }
}

Describe 'secret masking' {
    It 'masks every secret key' {
        $meta = @{
            host         = 'Example.COM'
            hostkey      = 'example.com'
            userid       = 'user-1'
            email        = 'a@example.com'
            passwordhash = 'HASHVALUE'
            password     = 'secret'
            apitoken     = 'tok'
            apikey       = 'k'
            apisecret    = 's'
            accesstoken  = 'at'
            stripewhsec  = 'whsec'
            mysecret     = 'x'
            customtoken  = 'y'
            partnerid    = '42'
        }
        $d = Convert-FolderS3MetadataForDisplay -Metadata $meta
        $d['passwordhash'] | Should Be '***set***'
        $d['password'] | Should Be '***set***'
        $d['apitoken'] | Should Be '***set***'
        $d['apikey'] | Should Be '***set***'
        $d['apisecret'] | Should Be '***set***'
        $d['accesstoken'] | Should Be '***set***'
        $d['stripewhsec'] | Should Be '***set***'
        $d['mysecret'] | Should Be '***set***'
        $d['customtoken'] | Should Be '***set***'
        $d['hostkey'] | Should Be 'example.com'
        $d['userid'] | Should Be 'user-1'
        $d['partnerid'] | Should Be '42'
        $d['email'] | Should Be 'a@example.com'
        $j = Convert-FolderS3MetadataForJson -Metadata $meta
        $j['passwordhash'].masked | Should Be $true
        $j['email'].pii | Should Be $true
        $j['email'].value | Should Be 'a@example.com'
    }

    It 'empty secret shows (empty)' {
        $d = Convert-FolderS3MetadataForDisplay -Metadata @{ password = '' }
        $d['password'] | Should Be '(empty)'
    }
}

Describe 'Get-FolderMeta.ps1' {
    $mount = Join-Path $env:TEMP 'fr4043-meta-mount'
    $scriptPath = Join-Path $tools 'Get-FolderMeta.ps1'

    BeforeEach {
        if (Test-Path $mount) { Remove-Item -LiteralPath $mount -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-clubs\host1\guid1') | Out-Null
    }

    It 'Json output with metadata tags and empty annotations' {
        $head = {
            param($b, $k)
            '{"Metadata":{"host":"Example.COM","hostkey":"example.com","passwordhash":"SECRET","userid":"u1","email":"e@x.com"},"ContentLength":0}'
        }
        $tags = {
            param($b, $k)
            '{"TagSet":[{"Key":"hasdns","Value":"1"},{"Key":"partnerid","Value":"9"}]}'
        }
        $listAnn = {
            param($b, $k)
            '{"Annotations":[]}'
        }
        $getAnn = { param($b, $k, $n) return $null }

        $out = & $scriptPath -Path (Join-Path $mount 'a-clubs\host1') -MountRoot $mount -Json -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags `
            -AwsListAnnotations $listAnn -AwsGetAnnotation $getAnn 2>&1
        $code = $LASTEXITCODE
        $code | Should Be 0
        $text = ($out | Out-String)
        $doc = $text | ConvertFrom-Json
        $doc.kind | Should Be 'host'
        $doc.bucket | Should Be 'a-clubs'
        $doc.key | Should Be 'host1/'
        $doc.metadata.passwordhash.masked | Should Be $true
        $doc.metadata.hostkey | Should Be 'example.com'
        $doc.metadata.email.pii | Should Be $true
        $doc.tags.hasdns | Should Be '1'
        @($doc.annotations).Count | Should Be 0
        $text | Should Not Match 'SECRET'
    }

    It 'shows annotation payloads and host annotation for GUID' {
        $head = {
            param($b, $k)
            if ($k -eq 'host1/guid1/') {
                return '{"Metadata":{"uri":"/p","seen":"0"},"ContentLength":0}'
            }
            return '{"Metadata":{"host":"Example.COM","hostkey":"host1"},"ContentLength":0}'
        }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $listAnn = {
            param($b, $k)
            if ($k -eq 'host1/') {
                return '{"Annotations":[{"AnnotationName":"annotation","Size":12}]}'
            }
            return '{"Annotations":[{"AnnotationName":"annotation","Size":8},{"AnnotationName":"steering","Size":5}]}'
        }
        $getAnn = {
            param($b, $k, $n)
            if ($k -eq 'host1/' -and $n -eq 'annotation') { return '{"summary":"host"}' }
            if ($n -eq 'annotation') { return '{"page":"ok"}' }
            if ($n -eq 'steering') { return 'steer' }
            return $null
        }
        $out = & $scriptPath -Path (Join-Path $mount 'a-clubs\host1\guid1') -MountRoot $mount -Json -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags `
            -AwsListAnnotations $listAnn -AwsGetAnnotation $getAnn 2>&1
        $LASTEXITCODE | Should Be 0
        $doc = ($out | Out-String) | ConvertFrom-Json
        $doc.kind | Should Be 'guid'
        ($doc.annotations | Where-Object { $_.Name -eq 'steering' }).Payload | Should Be 'steer'
        $doc.hostAnnotation.Name | Should Be 'annotation'
        $doc.hostAnnotation.Payload | Should Match 'host'
    }

    It 'marker with no annotations' {
        $head = { param($b, $k) '{"Metadata":{"host":"h"},"ContentLength":0}' }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $listAnn = { param($b, $k) $null }
        $getAnn = { param($b, $k, $n) $null }
        $out = & $scriptPath -Path (Join-Path $mount 'a-clubs\host1') -MountRoot $mount -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags `
            -AwsListAnnotations $listAnn -AwsGetAnnotation $getAnn 2>&1
        $LASTEXITCODE | Should Be 0
        ($out | Out-String) | Should Match '\(none\)'
    }

    It 'outside mount exits 2' {
        $head = { param($b, $k) '{}' }
        $null = & $scriptPath -Path 'C:\Windows\System32' -MountRoot $mount -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $head `
            -AwsListAnnotations $head -AwsGetAnnotation $head 2>&1
        $LASTEXITCODE | Should Be 2
    }

    It 'rclone backend returns metadata' {
        $rc = {
            param($b, $k)
            '[{"Path":"host1","Metadata":{"host":"Example.COM","apikey":"LEAK"}}]'
        }
        $listAnn = { param($b, $k) '{"Annotations":[]}' }
        $getAnn = { param($b, $k, $n) $null }
        $out = & $scriptPath -Path (Join-Path $mount 'a-clubs\host1') -MountRoot $mount -Json -Backend rclone `
            -RcloneLsJson $rc -AwsListAnnotations $listAnn -AwsGetAnnotation $getAnn 2>&1
        $LASTEXITCODE | Should Be 0
        $text = ($out | Out-String)
        $text | Should Not Match 'LEAK'
        $doc = $text | ConvertFrom-Json
        $doc.backend | Should Be 'rclone'
        $doc.metadata.apikey.masked | Should Be $true
    }
}

Describe 'Invoke-FolderSearch.ps1' {
    $mount = Join-Path $env:TEMP 'fr4043-search-mount'
    $scriptPath = Join-Path $tools 'Invoke-FolderSearch.ps1'

    BeforeEach {
        if (Test-Path $mount) { Remove-Item -LiteralPath $mount -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') | Out-Null
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-clubs\hostkey1\guid-bbb') | Out-Null
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-affiliates\awin\x') | Out-Null
        $env:A_SEARCH_AGENT_API_KEY = 'FAKE_AGENT_KEY_FOR_TEST'
    }
    AfterEach {
        Remove-Item Env:A_SEARCH_AGENT_API_KEY -ErrorAction SilentlyContinue
    }

    It 'GUID folder posts host from metadata and prints searchid' {
        $calls = @{}
        $head = {
            param($b, $k)
            if ($k -eq 'hostkey1/') {
                return '{"Metadata":{"host":"Original.Host","hostkey":"hostkey1"},"ContentLength":0}'
            }
            return '{"Metadata":{},"ContentLength":0}'
        }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $getObj = {
            param($b, $k)
            if ($k -match 'searches.json') {
                return '{"queries":["brake pads"],"exclude":[]}'
            }
            return $null
        }
        $invoke = {
            param($endpoint, $body, $key, $profile)
            $calls['body'] = $body
            $calls['key'] = $key
            $calls['endpoint'] = $endpoint
            return '{"searchid":"sid-1","queued":["amazon","ebay"]}'
        }
        $out = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1\guid-aaa') -MountRoot $mount `
            -SearchApiUrl 'https://example.test' -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -InvokeSearch $invoke 2>&1
        $LASTEXITCODE | Should Be 0
        $calls['body'].host | Should Be 'Original.Host'
        $calls['body'].hostkey | Should Be 'hostkey1'
        $calls['body'].guid | Should Be 'guid-aaa'
        $calls['body'].queries[0] | Should Be 'brake pads'
        ($out | Out-String) | Should Match 'searchid=sid-1'
        ($out | Out-String) | Should Not Match 'FAKE_AGENT_KEY'
    }

    It 'host folder without -All exits 4' {
        $head = { param($b, $k) '{"Metadata":{"host":"h"},"ContentLength":0}' }
        $null = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1') -MountRoot $mount `
            -SearchApiUrl 'https://example.test' -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $head -AwsGetObject $head `
            -InvokeSearch { param($e,$b,$k,$p) '{}' } 2>&1
        $LASTEXITCODE | Should Be 4
    }

    It 'host folder with -All searches each GUID' {
        $seen = New-Object System.Collections.ArrayList
        $head = {
            param($b, $k)
            '{"Metadata":{"host":"Original.Host","hostkey":"hostkey1"},"ContentLength":0}'
        }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $getObj = { param($b, $k) '{"queries":["q1"],"exclude":[]}' }
        $invoke = {
            param($endpoint, $body, $key, $profile)
            [void]$seen.Add($body.guid)
            return '{"searchid":"s","queued":["amazon"]}'
        }
        $out = & $scriptPath -Path (Join-Path $mount 'a-clubs\hostkey1') -MountRoot $mount -All `
            -SearchApiUrl 'https://example.test' -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags -AwsGetObject $getObj `
            -InvokeSearch $invoke 2>&1
        $LASTEXITCODE | Should Be 0
        $seen.Count | Should Be 2
        ($seen -contains 'guid-aaa') | Should Be $true
        ($seen -contains 'guid-bbb') | Should Be $true
        ($out | Out-String) | Should Not Match 'FAKE_AGENT_KEY'
    }

    It 'non a-clubs exits 3' {
        $head = { param($b, $k) '{"Metadata":{},"ContentLength":0}' }
        $null = & $scriptPath -Path (Join-Path $mount 'a-affiliates\awin\x') -MountRoot $mount `
            -SearchApiUrl 'https://example.test' -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $head -AwsGetObject $head `
            -InvokeSearch { '{}' } 2>&1
        $LASTEXITCODE | Should Be 3
    }
}
Describe "FR #4087 WinPS 5.1 folder-tools fixes" {
    It "parses multi-line CLI JSON arrays (ConvertFrom-FolderS3Json)" {
        $lines = @("{", "  ""Metadata"": { ""host"": ""Example.COM"" },", "  ""ContentLength"": 0", "}")
        $doc = ConvertFrom-FolderS3Json $lines
        $doc.Metadata.host | Should Be "Example.COM"
    }

    It "preserves bare drive-letter mount roots" {
        Get-FolderS3MountRoot -MountRoot "S:\" | Should Be "S:\"
        Get-FolderS3MountRoot -MountRoot "S:" | Should Be "S:\"
        Get-FolderS3MountRoot -MountRoot "S:\." | Should Be "S:\"
        Get-FolderS3MountRoot -MountRoot "D:\s3" | Should Be "D:\s3"
        Get-FolderS3MountRoot -MountRoot "D:\s3\" | Should Be "D:\s3"
    }

    It "head_failed when head returns empty" {
        $mount = Join-Path $env:TEMP "fr4087-head-mount"
        if (Test-Path $mount) { Remove-Item -LiteralPath $mount -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Force -Path (Join-Path $mount "a-clubs\host1") | Out-Null
        $scriptPath = Join-Path $tools "Get-FolderMeta.ps1"
        $head = { param($b, $k) return $null }
        $tags = { param($b, $k) return $null }
        $listAnn = { param($b, $k) return $null }
        $getAnn = { param($b, $k, $n) return $null }
        # [Console]::Error.WriteLine bypasses 2>&1; assert exit code (message is head_failed:)
        $null = & $scriptPath -Path (Join-Path $mount "a-clubs\host1") -MountRoot $mount -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags `
            -AwsListAnnotations $listAnn -AwsGetAnnotation $getAnn 2>&1
        $LASTEXITCODE | Should Be 1
        (Get-Content -LiteralPath (Join-Path $tools "FolderS3.ps1") -Raw) | Should Match "head_failed"
        $threw = $false
        try {
            Get-FolderS3ObjectMeta -Bucket "a-clubs" -Key "host1/" -Backend aws `
                -AwsHeadObject $head -AwsGetObjectTagging $tags | Out-Null
        } catch {
            $threw = $true
            $_.Exception.Message | Should Match "head_failed"
        }
        $threw | Should Be $true
    }

    It "bucket root exits 5 with bucket_root message" {
        $mount = Join-Path $env:TEMP "fr4087-bucket-mount"
        if (Test-Path $mount) { Remove-Item -LiteralPath $mount -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Force -Path (Join-Path $mount "a-clubs") | Out-Null
        $scriptPath = Join-Path $tools "Get-FolderMeta.ps1"
        $head = { param($b, $k) "{}" }
        $null = & $scriptPath -Path (Join-Path $mount "a-clubs") -MountRoot $mount -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $head `
            -AwsListAnnotations $head -AwsGetAnnotation $head 2>&1
        $LASTEXITCODE | Should Be 5
        (Get-Content -LiteralPath $scriptPath -Raw) | Should Match "bucket_root"
    }

    It "Get-FolderS3ObjectMeta parses string[] head JSON without Metadata bind error" {
        $head = {
            param($b, $k)
            @("{", "  ""Metadata"": { ""host"": ""H"", ""hostkey"": ""h"" },", "  ""ContentLength"": 0", "}")
        }
        $tags = { param($b, $k) @("{", "  ""TagSet"": []", "}") }
        $m = Get-FolderS3ObjectMeta -Bucket "a-clubs" -Key "host1/" -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags
        $m.Metadata["host"] | Should Be "H"
        $m.Metadata["hostkey"] | Should Be "h"
    }
}

