# FR #4108 --- Invoke-FolderDownload (Pester 3.4 / WinPS 5.1)
$ErrorActionPreference = 'Stop'
$tools = Join-Path (Split-Path $PSScriptRoot -Parent) 'tools'
. (Join-Path $tools 'FolderS3.ps1')

Describe 'Invoke-FolderDownload.ps1 cwd resolution' {
    $mount = Join-Path $env:TEMP 'fr4108-download-mount'
    $scriptPath = Join-Path $tools 'Invoke-FolderDownload.ps1'

    BeforeEach {
        if (Test-Path $mount) { Remove-Item -LiteralPath $mount -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-affiliates\awin\aff1') | Out-Null
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-affiliates\awin\aff2') | Out-Null
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-clubs\host1') | Out-Null
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-affiliates\awin\aff1\parts') | Out-Null
    }

    It 'outside mount exits 2' {
        $inv = { param($p, $a, $m, $f, $d, $b) '{"ok":true,"status":"dry_run","feedurlSet":true}' }
        $null = & $scriptPath -Path 'C:\Windows' -MountRoot $mount -DryRun -InvokeDownload $inv 2>&1
        $LASTEXITCODE | Should Be 2
    }

    It 'wrong bucket exits 3' {
        $head = { param($b, $k) '{"Metadata":{},"ContentLength":0}' }
        $inv = { param($p, $a, $m, $f, $d, $b) '{"ok":true,"status":"ok"}' }
        $null = & $scriptPath -Path (Join-Path $mount 'a-clubs\host1') -MountRoot $mount `
            -Backend aws -AwsHeadObject $head -AwsGetObjectTagging $head -InvokeDownload $inv 2>&1
        $LASTEXITCODE | Should Be 3
    }

    It 'provider without -All exits 4' {
        $head = { param($b, $k) '{"Metadata":{},"ContentLength":0}' }
        $inv = { param($p, $a, $m, $f, $d, $b) '{"ok":true,"status":"ok"}' }
        $null = & $scriptPath -Path (Join-Path $mount 'a-affiliates\awin') -MountRoot $mount `
            -Backend aws -AwsHeadObject $head -AwsGetObjectTagging $head -InvokeDownload $inv 2>&1
        $LASTEXITCODE | Should Be 4
    }

    It 'bucket root exits 5' {
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-affiliates-only') | Out-Null
        # use a-affiliates bucket root path
        $affRoot = Join-Path $mount 'a-affiliates'
        $head = { param($b, $k) '{}' }
        $null = & $scriptPath -Path $affRoot -MountRoot $mount -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $head `
            -InvokeDownload { '{}' } 2>&1
        $LASTEXITCODE | Should Be 5
    }

    It 'dry run prints redacted summary and never needs fetch' {
        $head = {
            param($b, $k)
            '{"Metadata":{"feedurl":"https://example.test/feed?key=SECRETLEAK","password":"pw","format":"csv","affiliateid":"aff1"},"ContentLength":0}'
        }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $called = @{ n = 0 }
        $inv = {
            param($p, $a, $m, $f, $d, $b)
            $called.n += 1
            if (-not $d) { throw 'expected_dry_run' }
            if ($m['feedurl'] -notmatch 'SECRETLEAK') { throw 'meta_should_include_feedurl_for_engine' }
            return @{
                ok          = $true
                provider    = $p
                affiliateId = $a
                status      = 'dry_run'
                dryRun      = $true
                feedurlSet  = $true
                format      = 'csv'
                compression = 'none'
                datedKey    = 'awin/aff1/parts/2026-10-18.csv'
            }
        }
        $out = & $scriptPath -Path (Join-Path $mount 'a-affiliates\awin\aff1') -MountRoot $mount -DryRun `
            -Backend aws -AwsHeadObject $head -AwsGetObjectTagging $tags -InvokeDownload $inv 2>&1
        $LASTEXITCODE | Should Be 0
        $called.n | Should Be 1
        $text = ($out | Out-String)
        $text | Should Match 'dry_run'
        $text | Should Match 'feedurl=\*\*\*set\*\*\*'
        $text | Should Not Match 'SECRETLEAK'
        $text | Should Not Match '\bpw\b'
    }

    It 'missing feedurl on dry run exits 1' {
        $head = {
            param($b, $k)
            '{"Metadata":{"format":"csv","affiliateid":"aff1"},"ContentLength":0}'
        }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $inv = {
            param($p, $a, $m, $f, $d, $b)
            return @{
                ok          = $true
                status      = 'dry_run'
                feedurlSet  = $false
                datedKey    = 'awin/aff1/parts/2026-10-18.csv'
                provider    = $p
                affiliateId = $a
            }
        }
        $null = & $scriptPath -Path (Join-Path $mount 'a-affiliates\awin\aff1') -MountRoot $mount -WhatIf `
            -Backend aws -AwsHeadObject $head -AwsGetObjectTagging $tags -InvokeDownload $inv 2>&1
        $LASTEXITCODE | Should Be 1
    }

    It 'affiliate download calls InvokeDownload with provider and id' {
        $head = {
            param($b, $k)
            '{"Metadata":{"feedurl":"https://example.test/f","format":"csv"},"ContentLength":0}'
        }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $seen = @{}
        $inv = {
            param($p, $a, $m, $f, $d, $b)
            $seen['p'] = $p
            $seen['a'] = $a
            $seen['force'] = $f
            return @{
                ok          = $true
                provider    = $p
                affiliateId = $a
                status      = 'ok'
                size        = 12
                datedKey    = 'awin/aff1/parts/2026-10-18.csv'
            }
        }
        $out = & $scriptPath -Path (Join-Path $mount 'a-affiliates\awin\aff1') -MountRoot $mount `
            -Backend aws -AwsHeadObject $head -AwsGetObjectTagging $tags -InvokeDownload $inv 2>&1
        $LASTEXITCODE | Should Be 0
        $seen['p'] | Should Be 'awin'
        $seen['a'] | Should Be 'aff1'
        ($out | Out-String) | Should Match 'status=ok'
    }

    It 'provider -All downloads each affiliate child; one failure continues' {
        $head = {
            param($b, $k)
            '{"Metadata":{"feedurl":"https://example.test/f","format":"csv"},"ContentLength":0}'
        }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $seen = New-Object System.Collections.ArrayList
        $inv = {
            param($p, $a, $m, $f, $d, $b)
            [void]$seen.Add($a)
            if ($a -eq 'aff2') {
                return @{
                    ok          = $false
                    provider    = $p
                    affiliateId = $a
                    status      = 'missing_feedurl'
                    error       = 'missing_feedurl'
                }
            }
            return @{
                ok          = $true
                provider    = $p
                affiliateId = $a
                status      = 'ok'
                size        = 1
                datedKey    = "awin/$a/parts/2026-10-18.csv"
            }
        }
        $out = & $scriptPath -Path (Join-Path $mount 'a-affiliates\awin') -MountRoot $mount -All `
            -Backend aws -AwsHeadObject $head -AwsGetObjectTagging $tags -InvokeDownload $inv 2>&1
        $LASTEXITCODE | Should Be 1
        $seen.Count | Should Be 2
        $text = ($out | Out-String)
        $text | Should Match 'failed_affiliateids=aff2'
        $text | Should Not Match 'example.test'
    }

    It 'download.ps1 shim exists' {
        Test-Path (Join-Path $tools 'download.ps1') | Should Be $true
    }
}
