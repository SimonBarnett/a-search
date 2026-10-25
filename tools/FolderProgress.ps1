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
            $err = Receive-Job -Job $job -ErrorAction SilentlyContinue
            Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
            throw ('spinner_job_failed: {0}' -f ($err | Out-String))
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
