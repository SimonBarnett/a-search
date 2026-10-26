# FR #5174 --- FolderS3 aws CLI must pass --profile (never ambient AWS_PROFILE).

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path (Split-Path -Parent $here) 'tools'

Describe 'FR #5174 FolderS3 aws invocations use --profile' {
    It 'FolderS3 source pins --profile on every default aws s3api call' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'FolderS3.ps1') -Raw
        $raw | Should Match 'function Resolve-FolderS3CliProfile'
        # Default CLI builders must put --profile before s3api verbs (literal $profile in source).
        ($raw.Contains("'--profile', `$profile, 's3api', 'head-object'")) | Should Be $true
        ($raw.Contains("'--profile', `$profile, 's3api', 'get-object-tagging'")) | Should Be $true
        ($raw.Contains("'--profile', `$profile, 's3api', 'get-object'")) | Should Be $true
        ($raw.Contains("'--profile', `$profile, 's3api', 'list-object-annotations'")) | Should Be $true
        ($raw.Contains("'--profile', `$profile, 's3api', 'get-object-annotation'")) | Should Be $true
        # No bare ambient head-object without profile builder.
        ($raw.Contains('aws s3api head-object --bucket')) | Should Be $false
    }

    It 'Get-FolderS3ObjectMeta accepts -AwsProfile and default head passes it to aws' {
        . (Join-Path $tools 'FolderS3.ps1')
        $seen = @{ args = $null }
        $fakeHead = {
            param($b, $k, $profile)
            $seen['args'] = @($b, $k, $profile)
            return (@'
{"Metadata":{"userid":"u1"}}
'@)
        }
        $r = Get-FolderS3ObjectMeta -Bucket 'a-clubs' -Key 'host/' -Backend aws `
            -AwsHeadObject $fakeHead -AwsProfile 'a-search-redqueen-annotator' -SkipTags
        $seen['args'][2] | Should Be 'a-search-redqueen-annotator'
        $r.Metadata['userid'] | Should Be 'u1'
    }

    It 'default profile resolves to annotator when -AwsProfile omitted (ignores ambient AWS_PROFILE)' {
        . (Join-Path $tools 'FolderS3.ps1')
        $prev = $env:AWS_PROFILE
        $env:AWS_PROFILE = 'a-search-redqueen-agents'
        try {
            (Resolve-FolderS3CliProfile -AwsProfile '') | Should Be 'a-search-redqueen-annotator'
            (Resolve-FolderS3CliProfile) | Should Be 'a-search-redqueen-annotator'
            (Resolve-FolderS3CliProfile -AwsProfile 'explicit-profile') | Should Be 'explicit-profile'
        }
        finally {
            if ($null -eq $prev) { Remove-Item Env:\AWS_PROFILE -ErrorAction SilentlyContinue }
            else { $env:AWS_PROFILE = $prev }
        }
    }

    It 'search passes -AwsProfile into Get-FolderS3ObjectMeta' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'Invoke-FolderSearch.ps1') -Raw
        $raw | Should Match 'Get-FolderS3ObjectMeta[\s\S]{0,200}-AwsProfile\s+\$profile'
    }

    It 'meta passes -AwsProfile into Get-FolderS3ObjectMeta' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'Get-FolderMeta.ps1') -Raw
        $raw | Should Match 'Get-FolderS3ObjectMeta[\s\S]{0,250}-AwsProfile'
    }
}
