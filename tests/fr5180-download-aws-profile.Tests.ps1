# FR #5180 --- download list-objects-v2 must pass --profile (follow-up #5176).

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path (Split-Path -Parent $here) 'tools'
$download = Join-Path $tools 'Invoke-FolderDownload.ps1'

Describe 'FR #5180 download aws list-objects uses --profile' {
    It 'Get-FolderDownloadProviderNames argv includes --profile before s3api' {
        $raw = Get-Content -LiteralPath $download -Raw
        ($raw.Contains("'--profile', `$cliProfile, 's3api', 'list-objects-v2'")) | Should Be $true
        ($raw.Contains("Resolve-FolderDownloadAwsProfile") -or $raw.Contains("Resolve-FolderToolsAwsProfile") -or $raw.Contains("Resolve-FolderS3CliProfile")) | Should Be $true
    }

    It 'does not build bare s3api list-objects-v2 without --profile' {
        $raw = Get-Content -LiteralPath $download -Raw
        # strip comments
        $code = [regex]::Replace($raw, '(?m)^\s*#.*$', '')
        $code = [regex]::Replace($code, '(?s)<#.*?#>', '')
        ($code -match "(?s)awsArgs\s*=\s*@\(\s*'s3api',\s*'list-objects-v2'") | Should Be $false
    }

    It 'caller passes -AwsProfile into Get-FolderDownloadProviderNames' {
        $raw = Get-Content -LiteralPath $download -Raw
        $raw | Should Match 'Get-FolderDownloadProviderNames[\s\S]{0,120}-AwsProfile'
    }
}
