# FR #5164 --- meta annotator profile; install ToolFailure+shared; outbox off a-clubs (Pester 3.4).

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here
$tools = Join-Path $repo 'tools'
$metaLib = Join-Path $tools 'Get-FolderMeta.ps1'

Describe 'FR #5164 meta AWS profile (annotator / config; ignore agents env)' {
    It 'source documents annotator default, config helper, and ignores agents env' {
        $raw = Get-Content -LiteralPath $metaLib -Raw
        $raw | Should Match 'a-search-redqueen-annotator'
        $raw | Should Match 'Get-FolderMetaSearchConfig'
        # Synopsis / docs may name the ignored env; the resolver body must not read it.
        $raw | Should Match 'Does NOT use A_SEARCH_AGENTS_AWS_PROFILE'
        $raw | Should Match "return 'a-search-redqueen-annotator'"
        $fn = [regex]::Match($raw, '(?ms)function Resolve-FolderMetaAwsProfile\s*\{.*?^\}').Value
        $fn | Should Match 'a-search-redqueen-annotator'
        $code = [regex]::Replace($fn, '(?m)^\s*#.*$', '')
        $code | Should Not Match 'A_SEARCH_AGENTS_AWS_PROFILE'
        $code | Should Not Match '\$env:AWS_PROFILE'
        $code | Should Not Match '\$env:A_SEARCH_AGENTS_AWS_PROFILE'
    }

    It 'Resolve-FolderMetaAwsProfile prefers Config then annotator (isolated scriptblock)' {
        $fn = {
            param($AwsProfile, $Config)
            if ($AwsProfile) { return $AwsProfile }
            if ($Config -and $Config.PSObject.Properties['AwsProfile']) {
                $p = [string]$Config.AwsProfile
                if ($p -and $p.Trim()) { return $p.Trim() }
            }
            return 'a-search-redqueen-annotator'
        }
        $env:A_SEARCH_AGENTS_AWS_PROFILE = 'a-search-redqueen-agents'
        $env:AWS_PROFILE = 'shell-login-profile'
        (& $fn -AwsProfile '' -Config $null) | Should Be 'a-search-redqueen-annotator'
        (& $fn -AwsProfile '' -Config ([pscustomobject]@{ AwsProfile = 'from-cfg' })) | Should Be 'from-cfg'
        (& $fn -AwsProfile 'flag' -Config ([pscustomobject]@{ AwsProfile = 'from-cfg' })) | Should Be 'flag'
    }
}

Describe 'FR #5164 Install-SearchCommand copies ToolFailure + shared/intake' {
    It 'installer lists ToolFailure.ps1, reportToolFailure.js, and shared/intake' {
        $raw = Get-Content -LiteralPath (Join-Path $tools 'Install-SearchCommand.ps1') -Raw
        $raw | Should Match 'ToolFailure\.ps1'
        $raw | Should Match 'reportToolFailure\.js'
        $raw | Should Match 'shared\\intake'
        $raw | Should Match '\$ToolsDir = \$PSScriptRoot'
    }

    It 'fresh ToolsDir install includes failure reporter stack' {
        $install = Join-Path $tools 'Install-SearchCommand.ps1'
        $dest = Join-Path $env:TEMP 'fr5164-tools-install'
        $destParent = Join-Path $env:TEMP 'fr5164-install-root'
        $dest = Join-Path $destParent 'tools'
        if (Test-Path $destParent) { Remove-Item -LiteralPath $destParent -Recurse -Force }
        New-Item -ItemType Directory -Force -Path $destParent | Out-Null
        & $install -ToolsDir $dest -SkipPath -ForceConfig
        $LASTEXITCODE | Should Be 0
        (Test-Path -LiteralPath (Join-Path $dest 'ToolFailure.ps1')) | Should Be $true
        (Test-Path -LiteralPath (Join-Path $dest 'reportToolFailure.js')) | Should Be $true
        (Test-Path -LiteralPath (Join-Path $destParent 'shared\intake\reportToolFailure.js')) | Should Be $true
        (Test-Path -LiteralPath (Join-Path $dest 'meta.ps1')) | Should Be $true
    }
}
