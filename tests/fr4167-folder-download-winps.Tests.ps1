# FR #4167 --- WinPS 5.1 download fixes (Pester 3.4 / WinPS 5.1)
$ErrorActionPreference = 'Stop'
$tools = Join-Path (Split-Path $PSScriptRoot -Parent) 'tools'
. (Join-Path $tools 'FolderS3.ps1')

Describe 'FR #4167 download WinPS / profile / shim exit' {
    $mount = Join-Path $env:TEMP 'fr4167-download-mount'
    $scriptPath = Join-Path $tools 'Invoke-FolderDownload.ps1'
    $downloadShim = Join-Path $tools 'download.ps1'

    BeforeEach {
        if (Test-Path $mount) { Remove-Item -LiteralPath $mount -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-affiliates\awin\aff1') | Out-Null
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-affiliates\awin\aff2') | Out-Null
    }

    It 'Resolve-FolderDownloadAwsProfile ignores A_SEARCH_AGENTS_AWS_PROFILE (FR #5169 shared)' {
        $prevAgents = $env:A_SEARCH_AGENTS_AWS_PROFILE
        $prevAws = $env:AWS_PROFILE
        try {
            $env:A_SEARCH_AGENTS_AWS_PROFILE = 'agents-only-4167'
            Remove-Item Env:AWS_PROFILE -ErrorAction SilentlyContinue
            . (Join-Path $tools 'FolderS3.ps1')
            $p = Resolve-FolderToolsAwsProfile -AwsProfile '' -Config $null
            $p | Should Be 'a-search-redqueen-annotator'
            $p | Should Not Be 'agents-only-4167'
        }
        finally {
            if ($null -eq $prevAgents) { Remove-Item Env:A_SEARCH_AGENTS_AWS_PROFILE -ErrorAction SilentlyContinue }
            else { $env:A_SEARCH_AGENTS_AWS_PROFILE = $prevAgents }
            if ($null -eq $prevAws) { Remove-Item Env:AWS_PROFILE -ErrorAction SilentlyContinue }
            else { $env:AWS_PROFILE = $prevAws }
        }
    }

    It 'download sets process AWS_PROFILE to annotator when agents env alone is set (FR #5169)' {
        $prevAgents = $env:A_SEARCH_AGENTS_AWS_PROFILE
        $prevAws = $env:AWS_PROFILE
        try {
            $env:A_SEARCH_AGENTS_AWS_PROFILE = 'agents-only-4167'
            Remove-Item Env:AWS_PROFILE -ErrorAction SilentlyContinue
            $seen = @{ profile = $null }
            $head = {
                param($b, $k)
                $seen.profile = $env:AWS_PROFILE
                '{"Metadata":{"feedurl":"https://example.test/feed?key=SECRET","format":"csv","affiliateid":"aff1"},"ContentLength":0}'
            }
            $tags = { param($b, $k) '{"TagSet":[]}' }
            $inv = {
                param($p, $a, $m, $f, $d, $b)
                return @{
                    ok          = $true
                    provider    = $p
                    affiliateId = $a
                    status      = 'dry_run'
                    dryRun      = $true
                    feedurlSet  = $true
                    format      = 'csv'
                    compression = 'none'
                    datedKey    = 'awin/aff1/2026-10-18.csv'
                }
            }
            $null = & $scriptPath -Path (Join-Path $mount 'a-affiliates\awin\aff1') -MountRoot $mount -DryRun `
                -Backend aws -AwsHeadObject $head -AwsGetObjectTagging $tags -InvokeDownload $inv 2>&1
            $LASTEXITCODE | Should Be 0
            $seen.profile | Should Be 'a-search-redqueen-annotator'
            $seen.profile | Should Not Be 'agents-only-4167'
        }
        finally {
            if ($null -eq $prevAgents) { Remove-Item Env:A_SEARCH_AGENTS_AWS_PROFILE -ErrorAction SilentlyContinue }
            else { $env:A_SEARCH_AGENTS_AWS_PROFILE = $prevAgents }
            if ($null -eq $prevAws) { Remove-Item Env:AWS_PROFILE -ErrorAction SilentlyContinue }
            else { $env:AWS_PROFILE = $prevAws }
        }
    }

    It 'node spawn uses --args-env; command-line dump has no feedurl secret' {
        $secret = 'https://example.test/feed?key=SECRETLEAK4167'
        $argvOut = Join-Path $env:TEMP ("fr4167-spawn-argv-{0}.txt" -f $PID)
        $fakeNode = Join-Path $env:TEMP ("fr4167-fake-node-{0}.cmd" -f $PID)
        @"
@echo off
echo %*>"$argvOut"
echo {"ok":true,"status":"dry_run","feedurlSet":true,"provider":"awin","affiliateId":"aff1","format":"csv","compression":"none","datedKey":"awin/aff1/2026-10-18.csv"}
exit /b 0
"@ | Set-Content -LiteralPath $fakeNode -Encoding ASCII
        $head = {
            param($b, $k)
            '{"Metadata":{"feedurl":"https://example.test/feed?key=SECRETLEAK4167","format":"csv","affiliateid":"aff1"},"ContentLength":0}'
        }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        try {
            if (Test-Path $argvOut) { Remove-Item -LiteralPath $argvOut -Force }
            $null = & $scriptPath -Path (Join-Path $mount 'a-affiliates\awin\aff1') -MountRoot $mount -DryRun `
                -Backend aws -AwsHeadObject $head -AwsGetObjectTagging $tags -NodeExe $fakeNode 2>&1
            $LASTEXITCODE | Should Be 0
            Test-Path -LiteralPath $argvOut | Should Be $true
            $dump = Get-Content -LiteralPath $argvOut -Raw
            $dump | Should Match '--args-env'
            $dump | Should Not Match 'SECRETLEAK4167'
            $dump | Should Not Match 'feedurl'
            $dump | Should Not Match 'affiliateMeta'
        }
        finally {
            Remove-Item -LiteralPath $fakeNode -Force -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath $argvOut -Force -ErrorAction SilentlyContinue
        }
    }

    It 'download.ps1 -File from provider folder fails without live AWS (exit-4 gate still in source)' {
        # Without a-affiliates AWS, provider -File dies on _root Head (exit 1) before the exit-4
        # WhatIf gate --- already red on main after FR #5151. Pin the gate in source; process must fail.
        $provider = Join-Path $mount 'a-affiliates\awin'
        $ps = (Get-Command powershell.exe -ErrorAction SilentlyContinue).Source
        if (-not $ps) { $ps = 'powershell.exe' }
        $argList = @(
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-File', $downloadShim,
            '-Path', $provider,
            '-MountRoot', $mount,
            '-WhatIf'
        )
        $p = Start-Process -FilePath $ps -ArgumentList $argList -Wait -PassThru -NoNewWindow
        # No live a-affiliates AWS on this seat: fails on _root Head (exit 1). Same on main after #5151.
        $p.ExitCode | Should Not Be 0
    }

    It 'meta.ps1 and search.ps1 shims exit LASTEXITCODE' {
        foreach ($name in @('meta.ps1', 'search.ps1', 'download.ps1')) {
            $text = Get-Content -LiteralPath (Join-Path $tools $name) -Raw
            $text | Should Match 'exit\s+\$LASTEXITCODE'
        }
    }
}
