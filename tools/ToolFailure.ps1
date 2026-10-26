# FR #5151: shared failure filing for a-search CLI tools.
# Prints the real error first (caller). Filing is fail-soft and never changes exit code.

function Get-ASearchToolRedactedText {
    param([string]$Text)
    if (-not $Text) { return '' }
    $t = [string]$Text
    $t = $t -replace '(?i)(api[_-]?key|token|password|secret|authorization)\s*[:=]\s*\S+', '$1=***'
    $t = $t -replace '(?i)\bAKIA[0-9A-Z]{16}\b', 'AKIA***'
    $t = $t -replace '(?i)Bearer\s+\S+', 'Bearer ***'
    return $t
}

function Get-ASearchToolErrorText {
    param($ErrorRecord)
    if ($null -eq $ErrorRecord) { return '(no error detail)' }
    $parts = New-Object System.Collections.Generic.List[string]
    function Add-Part([string]$s) {
        if (-not $s) { return }
        $tr = $s.Trim()
        if (-not $tr) { return }
        if ($parts -contains $tr) { return }
        [void]$parts.Add($tr)
    }
    try {
        if ($ErrorRecord.Exception) {
            Add-Part ([string]$ErrorRecord.Exception.Message)
            if ($ErrorRecord.Exception.InnerException) {
                Add-Part ([string]$ErrorRecord.Exception.InnerException.Message)
            }
        }
    } catch { }
    try {
        if ($ErrorRecord.PSObject.Properties['ScriptStackTrace'] -and $ErrorRecord.ScriptStackTrace) {
            Add-Part ([string]$ErrorRecord.ScriptStackTrace)
        }
    } catch { }
    try {
        Add-Part ([string]$ErrorRecord)
    } catch { }
    if ($parts.Count -eq 0) { return '(no error detail)' }
    return (Get-ASearchToolRedactedText (($parts -join "; ")))
}

function Get-ASearchAwsIdentityArn {
    # Fail-soft: ARN only, never keys. Empty when aws missing or call fails.
    try {
        if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { return '' }
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $raw = aws sts get-caller-identity --query Arn --output text 2>$null
            if ($LASTEXITCODE -ne 0) { return '' }
            $arn = (($raw | Out-String) -replace '[\x00-\x1F]', '').Trim()
            if ($arn -match '^arn:') { return $arn }
        }
        finally { $ErrorActionPreference = $prev }
    } catch { }
    return ''
}

function Get-ASearchGitCommitShort {
    param([string]$RepoRoot)
    try {
        if (-not $RepoRoot) { $RepoRoot = Split-Path -Parent $PSScriptRoot }
        if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return '' }
        $c = & git -C $RepoRoot rev-parse --short HEAD 2>$null
        if ($LASTEXITCODE -eq 0 -and $c) { return ([string]$c).Trim() }
    } catch { }
    return ''
}

function Invoke-ASearchToolFailureReport {
    <#
    .SYNOPSIS
    FR #5151: file an a-search issue (intake) for a CLI tool failure. Fail-soft.
    Prints issue URL / intake id on success, or issue_report_failed: <reason>.
    Never throws; never changes the caller's exit code.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Tool,
        [string]$ErrorCode = 'error',
        [string]$Detail = '',
        [int]$ExitCode = 1,
        [string]$Cwd = '',
        [string]$S3Uri = '',
        [string]$CommandLine = '',
        [string]$AwsIdentityArn = '',
        [string]$OutboxRoot = '',
        [scriptblock]$Reporter # injectable for tests: receives hashtable, returns object/json
    )
    # FR #5151: opt-out + never file from Pester frNNNN temp mounts (avoid intake spam).
    if ($env:A_SEARCH_TOOL_FAILURE_DISABLE -eq '1') { return }
    if (($Cwd -and $Cwd -match 'fr\d{4}-') -or ($CommandLine -and $CommandLine -match 'fr\d{4}-') -or ($S3Uri -and $S3Uri -match 'fr\d{4}-')) {
        return
    }
    try {
        $safeDetail = Get-ASearchToolRedactedText $Detail
        if (-not $safeDetail) { $safeDetail = '(no error detail)' }
        if ($safeDetail.Length -gt 1500) { $safeDetail = $safeDetail.Substring(0, 1500) }
        $safeCmd = Get-ASearchToolRedactedText $CommandLine
        if ($safeCmd.Length -gt 500) { $safeCmd = $safeCmd.Substring(0, 500) }
        $code = if ($ErrorCode) { $ErrorCode } else { 'error' }
        # Prefer first token before ':' as errorCode when caller passed a full message as code
        if ($code -eq 'error' -and $safeDetail -match '^([a-z0-9_]+)\s*:') {
            $code = $Matches[1]
        }
        if (-not $Cwd) { $Cwd = (Get-Location).Path }
        if (-not $AwsIdentityArn) { $AwsIdentityArn = Get-ASearchAwsIdentityArn }
        $git = Get-ASearchGitCommitShort

        if ($Reporter) {
            $r = & $Reporter @{
                Tool            = $Tool
                ErrorCode       = $code
                Detail          = $safeDetail
                ExitCode        = $ExitCode
                Cwd             = $Cwd
                S3Uri           = $S3Uri
                CommandLine     = $safeCmd
                AwsIdentityArn  = $AwsIdentityArn
                GitCommit       = $git
            }
        }
        else {
            $reporterJs = Join-Path $PSScriptRoot 'reportToolFailure.js'
            if (-not (Test-Path -LiteralPath $reporterJs)) {
                [Console]::Error.WriteLine('issue_report_failed: reporter_missing')
                return
            }
            $node = Get-Command node -ErrorAction SilentlyContinue
            if (-not $node) {
                [Console]::Error.WriteLine('issue_report_failed: node_missing')
                return
            }
            $argList = @(
                $reporterJs,
                '--tool', $Tool,
                '--errorCode', $code,
                '--detail', $safeDetail,
                '--exitCode', ([string]$ExitCode),
                '--cwd', $Cwd,
                '--s3Uri', $S3Uri,
                '--commandLine', $safeCmd,
                '--awsIdentityArn', $AwsIdentityArn,
                '--gitCommit', $git
            )
            if ($OutboxRoot) { $argList += @('--outboxRoot', $OutboxRoot) }
            $prev = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            try {
                $out = & $node.Source @argList 2>&1
            }
            finally { $ErrorActionPreference = $prev }
            $jsonLine = ($out | Where-Object { $_ -match '^\s*\{' } | Select-Object -Last 1)
            if (-not $jsonLine) {
                [Console]::Error.WriteLine(('issue_report_failed: {0}' -f (Get-ASearchToolRedactedText (($out | Out-String).Trim()))))
                return
            }
            try {
                $r = $jsonLine | ConvertFrom-Json
            }
            catch {
                [Console]::Error.WriteLine('issue_report_failed: bad_json')
                return
            }
        }

        if ($null -eq $r) {
            [Console]::Error.WriteLine('issue_report_failed: empty_result')
            return
        }
        if ($r.ok -eq $true -or $r.ok -eq 'True') {
            if ($r.issueUrl) {
                [Console]::Error.WriteLine(('issue_filed: {0}' -f $r.issueUrl))
            }
            elseif ($r.intakeId) {
                [Console]::Error.WriteLine(('issue_filed: intake_id={0}' -f $r.intakeId))
            }
            else {
                [Console]::Error.WriteLine('issue_filed: ok')
            }
            return
        }
        $reason = if ($r.skipped) { [string]$r.skipped } elseif ($r.error) { [string]$r.error } else { 'unknown' }
        if ($r.outboxPath) {
            [Console]::Error.WriteLine(('issue_report_failed: {0} outbox={1}' -f $reason, $r.outboxPath))
        }
        else {
            [Console]::Error.WriteLine(('issue_report_failed: {0}' -f $reason))
        }
    }
    catch {
        $m = Get-ASearchToolRedactedText $_.Exception.Message
        [Console]::Error.WriteLine(('issue_report_failed: {0}' -f $m))
    }
}
