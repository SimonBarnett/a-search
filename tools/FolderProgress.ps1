# Shared progress helpers for folder tools (onboard / download / meta).
# Steps and spinner go to stderr so stdout stays for summaries / JSON.

$script:FolderToolSpinChars = @('/', '|', '\', '-')

function Write-FolderToolStep {
    param([Parameter(Mandatory = $true)][string]$Message)
    [Console]::Error.WriteLine(('[{0}] {1}' -f (Get-Date).ToString('HH:mm:ss'), $Message))
}

function Write-FolderToolDetail {
    param([Parameter(Mandatory = $true)][string]$Message)
    [Console]::Error.WriteLine(('         {0}' -f $Message))
}

function Clear-FolderToolSpinnerLine {
    [Console]::Error.Write("`r" + (' ' * 90) + "`r")
}

function Get-FolderToolJobFailureText {
    <#
    .SYNOPSIS
    FR #5148: build a non-empty failure string from a Failed Start-Job.
    Receive-Job alone often returns empty output; the real reason is in
    JobStateInfo.Reason (job + ChildJobs) and the job error stream / -ErrorVariable.
    #>
    param(
        $Job,
        $ReceiveOutput,
        $ErrorVariableErrors
    )
    $parts = New-Object System.Collections.Generic.List[string]
    function Add-Part([string]$s) {
        if (-not $s) { return }
        $t = $s.Trim()
        if (-not $t) { return }
        if ($parts -contains $t) { return }
        [void]$parts.Add($t)
    }
    if ($null -ne $ReceiveOutput) {
        Add-Part (($ReceiveOutput | Out-String))
    }
    foreach ($e in @($ErrorVariableErrors)) {
        if ($null -eq $e) { continue }
        $exProp = $e.PSObject.Properties['Exception']
        if ($exProp -and $exProp.Value -and $exProp.Value.Message) { Add-Part ([string]$exProp.Value.Message) }
        else { Add-Part ([string]$e) }
    }
    $jobs = @($Job)
    if ($Job -and $Job.ChildJobs) { $jobs += @($Job.ChildJobs) }
    foreach ($j in $jobs) {
        if (-not $j) { continue }
        if ($j.PSObject.Properties['JobStateInfo'] -and $j.JobStateInfo -and $j.JobStateInfo.PSObject.Properties['Reason'] -and $j.JobStateInfo.Reason) {
            $reason = $j.JobStateInfo.Reason
            if ($reason -is [System.Exception]) {
                Add-Part ([string]$reason.Message)
                if ($reason.InnerException -and $reason.InnerException.Message) {
                    Add-Part ([string]$reason.InnerException.Message)
                }
            }
            else {
                $msgProp = $reason.PSObject.Properties['Message']
                if ($msgProp -and $msgProp.Value) { Add-Part ([string]$msgProp.Value) }
                else { Add-Part ([string]$reason) }
            }
        }
        try {
            if (-not $j.PSObject.Properties['Error']) { continue }
            foreach ($errRec in @($j.Error)) {
                if ($null -eq $errRec) { continue }
                $exProp = $errRec.PSObject.Properties['Exception']
                if ($exProp -and $exProp.Value -and $exProp.Value.Message) {
                    Add-Part ([string]$exProp.Value.Message)
                }
                else {
                    Add-Part ([string]$errRec)
                }
            }
        }
        catch { }
    }
    if ($parts.Count -eq 0) {
        return '(no job error detail)'
    }
    return ($parts -join '; ')
}

function Invoke-FolderToolWithSpinner {
    <#
    .SYNOPSIS
    Run a scriptblock in a background job while showing Label + /|\| spinner on stderr.
    Pass data via -ArgumentList only (job has no parent scope).
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][scriptblock]$ScriptBlock,
        [object[]]$ArgumentList = @()
    )
    $job = if ($ArgumentList -and $ArgumentList.Count) {
        Start-Job -ScriptBlock $ScriptBlock -ArgumentList $ArgumentList
    }
    else {
        Start-Job -ScriptBlock $ScriptBlock
    }
    $i = 0
    try {
        while ($job.State -eq 'Running') {
            $ch = $script:FolderToolSpinChars[$i % 4]
            [Console]::Error.Write(("`r[{0}] {1} {2}  " -f (Get-Date).ToString('HH:mm:ss'), $Label, $ch))
            Start-Sleep -Milliseconds 120
            $i++
        }
        Clear-FolderToolSpinnerLine
        if ($job.State -eq 'Failed') {
            $jobErr = $null
            $err = Receive-Job -Job $job -ErrorAction SilentlyContinue -ErrorVariable jobErr
            $detail = Get-FolderToolJobFailureText -Job $job -ReceiveOutput $err -ErrorVariableErrors $jobErr
            Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
            throw ('spinner_job_failed: {0}' -f $detail)
        }
        $result = Receive-Job -Job $job -ErrorAction Stop
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
        Write-FolderToolStep ('{0} - done' -f $Label)
        return $result
    }
    catch {
        Clear-FolderToolSpinnerLine
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
        throw
    }
}
