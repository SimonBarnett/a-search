# FR #5176 --- invite / onboard / dbimport aws CLI must pass --profile (follow-up #5174).

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path (Split-Path -Parent $here) 'tools'

Describe 'FR #5176 invite/onboard/dbimport aws invocations use --profile' {
    It 'invite.ps1 list-objects-v2 argv includes --profile before s3api' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'invite.ps1') -Raw
        ($raw.Contains("'--profile', `$cliProfile, 's3api', 'list-objects-v2'")) | Should Be $true
        ($raw.Contains("Resolve-FolderS3CliProfile")) | Should Be $true
    }

    It 'invite Get-InviteProviderEnabled passes -AwsProfile into Get-FolderS3ObjectMeta' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'invite.ps1') -Raw
        $raw | Should Match 'Get-FolderS3ObjectMeta[\s\S]{0,200}-AwsProfile'
    }

    It 'onboard list-objects-v2 argv includes --profile before s3api' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'Invoke-FolderOnboard.ps1') -Raw
        ($raw.Contains("'--profile', `$cliProfile, 's3api', 'list-objects-v2'")) | Should Be $true
        ($raw.Contains('aws s3 rm $prefix --recursive')) | Should Be $false
    }

    It 'onboard Remove-OnboardAffiliatePrefix passes --profile on aws s3 rm' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'Invoke-FolderOnboard.ps1') -Raw
        ($raw.Contains("'--profile', `$cliProfile, 's3', 'rm'")) | Should Be $true
        ($raw.Contains('Resolve-FolderS3CliProfile')) | Should Be $true
    }

    It 'onboard Get-ProviderMetaRaw passes -AwsProfile into Get-FolderS3ObjectMeta' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'Invoke-FolderOnboard.ps1') -Raw
        $raw | Should Match 'function Get-ProviderMetaRaw[\s\S]{0,400}Get-FolderS3ObjectMeta[\s\S]{0,200}-AwsProfile'
    }

    It 'dbimport list-objects-v2 argv includes --profile before s3api' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'Invoke-FolderDbImport.ps1') -Raw
        ($raw.Contains("'--profile', `$cliProfile, 's3api', 'list-objects-v2'")) | Should Be $true
        ($raw.Contains('Resolve-FolderS3CliProfile')) | Should Be $true
    }

    It 'dbimport Remove-DbImportS3Object passes --profile on delete-object' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'Invoke-FolderDbImport.ps1') -Raw
        ($raw.Contains("'--profile', `$cliProfile, 's3api', 'delete-object'")) | Should Be $true
        ($raw.Contains('aws s3api delete-object --bucket')) | Should Be $false
    }

    It 'dbimport Get-DbImportProviderEnabled passes -AwsProfile into Get-FolderS3ObjectMeta' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'Invoke-FolderDbImport.ps1') -Raw
        $raw | Should Match 'function Get-DbImportProviderEnabled[\s\S]{0,400}Get-FolderS3ObjectMeta[\s\S]{0,200}-AwsProfile'
    }
}
