# FR #5160 --- search POST spinner keeps x-amz-security-token out of Start-Job argv (Pester 3.4).

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path (Split-Path -Parent $here) 'tools'

Describe 'FR #5160 session token via process env (not job argv)' {
    It 'Invoke-FolderSearch uses A_SEARCH_SEARCH_CURL_SESSION_TOKEN and strips header from stripped args' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'Invoke-FolderSearch.ps1') -Raw
        $raw | Should Match 'A_SEARCH_SEARCH_CURL_SESSION_TOKEN'
        $raw | Should Match "GetEnvironmentVariable\('A_SEARCH_SEARCH_CURL_SESSION_TOKEN'"
        $raw | Should Match "SetEnvironmentVariable\('A_SEARCH_SEARCH_CURL_SESSION_TOKEN'"
        # Strip path looks for the header name (not a literal token value in ArgumentList).
        $raw | Should Match "StartsWith\('x-amz-security-token:'"
        # Job re-adds header from env inside ScriptBlock.
        $raw | Should Match "x-amz-security-token: \{0\}"
        # Still pairs with --user env from FR #5157.
        $raw | Should Match 'A_SEARCH_SEARCH_CURL_USER'
    }

    It 'README documents FR #5160 session-token env' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'README-folder-tools.md') -Raw
        $raw | Should Match 'FR #5160'
        $raw | Should Match 'A_SEARCH_SEARCH_CURL_SESSION_TOKEN'
    }
}
