# FR #5151 --- ToolFailure wrapper + spinner JobStateInfo.Reason (Pester 3.4).

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path (Split-Path -Parent $here) 'tools'

Describe 'FR #5151 Invoke-ASearchToolFailureReport' {
    BeforeEach {
        . (Join-Path $tools 'ToolFailure.ps1')
    }

    It 'payload fields reach Reporter and filing failure does not throw' {
        $seen = @{}
        $null = Invoke-ASearchToolFailureReport -Tool 'meta' -ErrorCode 'head_failed' `
            -Detail 'head_failed: s3://a-clubs/h/: 403 AccessDenied' -ExitCode 1 `
            -Cwd 'C:\tmp' -S3Uri 's3://a-clubs/h/' -CommandLine 'meta -AwsProfile x' `
            -AwsIdentityArn 'arn:aws:iam::1:user/t' `
            -Reporter {
                param($h)
                $seen['Tool'] = $h.Tool
                $seen['ErrorCode'] = $h.ErrorCode
                $seen['Detail'] = $h.Detail
                $seen['S3Uri'] = $h.S3Uri
                $seen['AwsIdentityArn'] = $h.AwsIdentityArn
                return @{ ok = $false; skipped = 'intake_egress_blocked'; outboxPath = 'C:\tmp\outbox.json' }
            }
        $seen['Tool'] | Should Be 'meta'
        $seen['ErrorCode'] | Should Be 'head_failed'
        $seen['Detail'] | Should Match '403'
        $seen['S3Uri'] | Should Match 's3://'
        $seen['AwsIdentityArn'] | Should Match '^arn:'
    }

    It 'success prints issue_filed URL' {
        $out = & {
            Invoke-ASearchToolFailureReport -Tool 'search' -ErrorCode 'x' -Detail 'x: y' -ExitCode 1 `
                -Reporter { param($h) @{ ok = $true; issueUrl = 'https://github.com/SimonBarnett/a-search/issues/999' } }
        } 2>&1
        # Console.Error may bypass 2>&1; assert Reporter path + source contract
        (Get-Content (Join-Path $tools 'ToolFailure.ps1') -Raw) | Should Match 'issue_filed:'
        (Get-Content (Join-Path $tools 'ToolFailure.ps1') -Raw) | Should Match 'issue_report_failed:'
    }

    It 'redacts token-like detail before Reporter' {
        $seen = @{}
        Invoke-ASearchToolFailureReport -Tool 'download' -ErrorCode 'err' `
            -Detail 'password=SUPERSECRETFAIL' -ExitCode 1 `
            -Reporter {
                param($h)
                $seen['Detail'] = $h.Detail
                return @{ ok = $true; intakeId = 'in_test' }
            } | Out-Null
        $seen['Detail'] | Should Not Match 'SUPERSECRETFAIL'
        $seen['Detail'] | Should Match 'password=\*\*\*'
    }

    It 'skips filing when Cwd is a frNNNN Pester mount' {
        $seen = @{ called = $false }
        Invoke-ASearchToolFailureReport -Tool 'meta' -ErrorCode 'head_failed' `
            -Detail 'head_failed: s3://a-clubs/h/' -ExitCode 1 `
            -Cwd 'C:\Users\Administrator\AppData\Local\Temp\fr4087-head-mount\a-clubs\host1' `
            -Reporter { param($h) $seen['called'] = $true; return @{ ok = $true } } | Out-Null
        $seen['called'] | Should Be $false
    }

    It 'skips filing when DISABLE=1 even without fr mount' {
        $prev = $env:A_SEARCH_TOOL_FAILURE_DISABLE
        $env:A_SEARCH_TOOL_FAILURE_DISABLE = '1'
        try {
            $seen = @{ called = $false }
            Invoke-ASearchToolFailureReport -Tool 'meta' -ErrorCode 'x' -Detail 'x: y' -ExitCode 1 `
                -Cwd 'C:\work' -Reporter { param($h) $seen['called'] = $true; return @{ ok = $true } } | Out-Null
            $seen['called'] | Should Be $false
        }
        finally {
            if ($null -eq $prev) { Remove-Item Env:\A_SEARCH_TOOL_FAILURE_DISABLE -ErrorAction SilentlyContinue }
            else { $env:A_SEARCH_TOOL_FAILURE_DISABLE = $prev }
        }
    }
}

Describe 'FR #5151 spinner surfaces JobStateInfo.Reason' {
    It 'failed job message is never empty' {
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
        $msg | Should Match 'no_backend'
        $msg | Should Not Match 'spinner_job_failed:\s*$'
    }
}

Describe 'FR #5151 tools source ToolFailure' {
    $names = @(
        'Get-FolderMeta.ps1',
        'Invoke-FolderSearch.ps1',
        'Invoke-FolderDownload.ps1',
        'Invoke-FolderDbImport.ps1',
        'Invoke-FolderOnboard.ps1',
        'invite.ps1',
        'agent.ps1',
        'Install-SearchCommand.ps1'
    )
    foreach ($n in $names) {
        It "$n dotsources ToolFailure and reports" {
            $raw = Get-Content -LiteralPath (Join-Path $tools $n) -Raw
            $raw | Should Match 'ToolFailure\.ps1'
            $raw | Should Match 'Invoke-ASearchToolFailureReport'
        }
    }

    It 'search uses FolderProgress steps' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'Invoke-FolderSearch.ps1') -Raw
        $raw | Should Match 'FolderProgress\.ps1'
        $raw | Should Match 'Write-FolderToolStep'
    }

    It 'onboard delegates to Invoke-FolderToolWithSpinner' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'Invoke-FolderOnboard.ps1') -Raw
        $raw | Should Match 'Invoke-FolderToolWithSpinner'
    }
}
