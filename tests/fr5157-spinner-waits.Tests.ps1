# FR #5157 --- search / invite / agent wrap waits in Invoke-FolderToolWithSpinner (Pester 3.4).

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path (Split-Path -Parent $here) 'tools'

Describe 'FR #5157 search wraps credential + POST waits' {
    It 'Invoke-FolderSearch dotsources FolderProgress and uses spinner labels' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'Invoke-FolderSearch.ps1') -Raw
        $raw | Should Match 'FolderProgress\.ps1'
        $raw | Should Match 'Invoke-FolderToolWithSpinner'
        $raw | Should Match 'aws export-credentials'
        $raw | Should Match 'POST /search'
        $raw | Should Match 'A_SEARCH_SEARCH_CURL_USER'
    }

    It 'export-credentials path uses spinner when Resolver is null' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'Invoke-FolderSearch.ps1') -Raw
        # Resolve-AwsCliCredentials: injectable Resolver bypasses spinner; live path wraps export-credentials.
        $raw | Should Match 'Resolve-AwsCliCredentials'
        $raw | Should Match 'Invoke-FolderToolWithSpinner -Label \("aws export-credentials'
    }

    It 'curl SigV4 POST uses spinner when CurlInvoke is null' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'Invoke-FolderSearch.ps1') -Raw
        $raw | Should Match 'Invoke-FolderToolWithSpinner -Label \("POST /search'
        # Secrets stay out of Start-Job argv.
        $raw | Should Match "GetEnvironmentVariable\('A_SEARCH_SEARCH_CURL_USER'"
    }
}

Describe 'FR #5157 invite wraps network waits' {
    It 'invite.ps1 dotsources FolderProgress and wraps list / head / node' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'invite.ps1') -Raw
        $raw | Should Match 'FolderProgress\.ps1'
        $raw | Should Match 'Invoke-FolderToolWithSpinner'
        $raw | Should Match 'aws s3api list-objects-v2'
        $raw | Should Match 'Head provider marker'
        $raw | Should Match 'invite node'
    }
}

Describe 'FR #5157 agent wraps node child work' {
    It 'agent.ps1 dotsources FolderProgress and wraps node run.js' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'agent.ps1') -Raw
        $raw | Should Match 'FolderProgress\.ps1'
        $raw | Should Match 'Invoke-FolderToolWithSpinner'
        $raw | Should Match 'agent node run\.js'
        $raw | Should Match 'Write-FolderToolStep'
    }
}

Describe 'FR #5157 spinner helper still surfaces job failure reason' {
    It 'failed job message is never empty' {
        . (Join-Path $tools 'FolderProgress.ps1')
        $msg = $null
        try {
            Invoke-FolderToolWithSpinner -Label 'fr5157-boom' -ScriptBlock {
                throw 'fr5157_probe_fail: deliberate'
            }
        }
        catch {
            $msg = $_.Exception.Message
        }
        $msg | Should Match 'spinner_job_failed:'
        $msg | Should Match 'fr5157_probe_fail'
    }
}
