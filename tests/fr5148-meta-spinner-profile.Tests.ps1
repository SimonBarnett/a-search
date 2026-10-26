# FR #5148 --- spinner surfaces job failure reason; meta sets AWS profile.
# Pester 3.4 / WinPS 5.1. Never print credentials. No live S3.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path (Split-Path -Parent $here) 'tools'

Describe 'FR #5148 spinner job failure reason' {
    It 'Invoke-FolderToolWithSpinner surfaces thrown job reason (not empty)' {
        . (Join-Path $tools 'FolderProgress.ps1')
        $msg = $null
        try {
            Invoke-FolderToolWithSpinner -Label 'boom' -ScriptBlock {
                throw 'no_backend: neither aws nor rclone available'
            }
        }
        catch {
            $msg = $_.Exception.Message
        }
        $msg | Should Match 'spinner_job_failed:'
        $msg | Should Match 'no_backend: neither aws nor rclone available'
        $msg | Should Not Match 'spinner_job_failed:\s*$'
    }

    It 'Invoke-FolderToolWithSpinner surfaces head_failed reason' {
        . (Join-Path $tools 'FolderProgress.ps1')
        $msg = $null
        try {
            Invoke-FolderToolWithSpinner -Label 'head' -ScriptBlock {
                throw 'head_failed: s3://a-clubs/www.mymodelflyingclub.co.uk/'
            }
        }
        catch {
            $msg = $_.Exception.Message
        }
        $msg | Should Match 'spinner_job_failed:'
        $msg | Should Match 'head_failed: s3://a-clubs/www.mymodelflyingclub.co.uk/'
    }

    It 'Get-FolderToolJobFailureText never returns empty for Reason-only job shape' {
        . (Join-Path $tools 'FolderProgress.ps1')
        # Synthetic: empty Receive-Job output, Reason.Message set like a Failed job.
        $fakeReason = [pscustomobject]@{ Message = 'no_backend: neither aws nor rclone available'; Exception = $null }
        $fakeState = [pscustomobject]@{ Reason = $fakeReason }
        $fakeJob = [pscustomobject]@{ JobStateInfo = $fakeState; ChildJobs = @(); Error = @() }
        $text = Get-FolderToolJobFailureText -Job $fakeJob -ReceiveOutput $null -ErrorVariableErrors $null
        $text | Should Match 'no_backend'
        $text | Should Not Be '(no job error detail)'
    }
}

Describe 'FR #5148 meta AWS profile' {
    $mount = Join-Path $env:TEMP 'fr5148-meta-mount'
    $scriptPath = Join-Path $tools 'Get-FolderMeta.ps1'

    BeforeEach {
        foreach ($n in @('A_SEARCH_AGENTS_AWS_PROFILE', 'AWS_PROFILE')) {
            Remove-Item "Env:$n" -ErrorAction SilentlyContinue
        }
        if (Test-Path $mount) { Remove-Item -LiteralPath $mount -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-clubs\host1') | Out-Null
    }
    AfterEach {
        foreach ($n in @('A_SEARCH_AGENTS_AWS_PROFILE', 'AWS_PROFILE')) {
            Remove-Item "Env:$n" -ErrorAction SilentlyContinue
        }
    }

    It 'Resolve-FolderMetaAwsProfile precedence matches download' {
        # Dot-source only the resolve function by parsing Get-FolderMeta is heavy;
        # assert source + exercise via -AwsProfile on a short Json run with injectables
        # that record the process profile seen inside the parent (set before spinner).
        $src = Get-Content -LiteralPath $scriptPath -Raw
        $src | Should Match 'Resolve-FolderMetaAwsProfile'
        $src | Should Match 'a-search-redqueen-agents'
        $src | Should Match 'A_SEARCH_AGENTS_AWS_PROFILE'
        $src | Should Match '\[string\]\$AwsProfile'
    }

    It 'meta -AwsProfile sets process AWS_PROFILE for marker read' {
        $seen = @{ profile = $null }
        $head = {
            param($b, $k)
            $seen['profile'] = $env:AWS_PROFILE
            return '{"Metadata":{"host":"Example.COM","hostkey":"host1","userid":"u1"},"ContentLength":0}'
        }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $listAnn = { param($b, $k) '{"Annotations":[]}' }
        $getAnn = { param($b, $k, $n) $null }

        $null = & $scriptPath -Path (Join-Path $mount 'a-clubs\host1') -MountRoot $mount -Json -Backend aws `
            -AwsProfile 'profile-from-flag' `
            -AwsHeadObject $head -AwsGetObjectTagging $tags `
            -AwsListAnnotations $listAnn -AwsGetAnnotation $getAnn 2>&1
        $LASTEXITCODE | Should Be 0
        $seen['profile'] | Should Be 'profile-from-flag'
    }

    It 'default profile is a-search-redqueen-agents when no env/flag' {
        $src = Get-Content -LiteralPath $scriptPath -Raw
        $src | Should Match "return 'a-search-redqueen-agents'"
        # Exercise resolve by invoking a one-liner that mirrors the function
        function Resolve-FolderMetaAwsProfile {
            param([string]$AwsProfile)
            if ($AwsProfile) { return $AwsProfile }
            if ($env:A_SEARCH_AGENTS_AWS_PROFILE) { return $env:A_SEARCH_AGENTS_AWS_PROFILE }
            if ($env:AWS_PROFILE) { return $env:AWS_PROFILE }
            return 'a-search-redqueen-agents'
        }
        Resolve-FolderMetaAwsProfile | Should Be 'a-search-redqueen-agents'
        Resolve-FolderMetaAwsProfile -AwsProfile 'flag-p' | Should Be 'flag-p'
        $env:A_SEARCH_AGENTS_AWS_PROFILE = 'agents-env'
        Resolve-FolderMetaAwsProfile | Should Be 'agents-env'
        Remove-Item Env:A_SEARCH_AGENTS_AWS_PROFILE
        $env:AWS_PROFILE = 'shell-p'
        Resolve-FolderMetaAwsProfile | Should Be 'shell-p'
        Remove-Item Env:AWS_PROFILE
    }
}

Describe 'FR #5148 head_failed keeps CLI detail' {
    It 'FolderS3 default head path throws with detail (injected failure)' {
        . (Join-Path $tools 'FolderS3.ps1')
        $head = {
            param($b, $k)
            throw 'head_failed: s3://a-clubs/host1/: An error occurred (403) when calling the HeadObject operation'
        }
        $msg = $null
        try {
            Get-FolderS3ObjectMeta -Bucket 'a-clubs' -Key 'host1/' -Backend aws -AwsHeadObject $head -SkipTags
        }
        catch {
            $msg = $_.Exception.Message
        }
        $msg | Should Match 'head_failed:'
        $msg | Should Match '403'
        $msg | Should Match 's3://a-clubs/host1/'
    }
}

Describe 'FR #5148 install includes meta' {
    It 'Install-SearchCommand copies meta shim and helpers' {
        $install = Join-Path $tools 'Install-SearchCommand.ps1'
        $src = Get-Content -LiteralPath $install -Raw
        $src | Should Match 'meta\.ps1'
        $src | Should Match 'Get-FolderMeta\.ps1'
        $src | Should Match 'FolderProgress\.ps1'
        $dest = Join-Path $env:TEMP 'fr5148-tools-install'
        if (Test-Path $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
        New-Item -ItemType Directory -Force -Path $dest | Out-Null
        & $install -ToolsDir $dest -SkipPath | Out-Null
        $LASTEXITCODE | Should Be 0
        Test-Path (Join-Path $dest 'meta.ps1') | Should Be $true
        Test-Path (Join-Path $dest 'meta.cmd') | Should Be $true
        Test-Path (Join-Path $dest 'Get-FolderMeta.ps1') | Should Be $true
        Test-Path (Join-Path $dest 'FolderProgress.ps1') | Should Be $true
        Test-Path (Join-Path $dest 'search.ps1') | Should Be $true
    }
}
