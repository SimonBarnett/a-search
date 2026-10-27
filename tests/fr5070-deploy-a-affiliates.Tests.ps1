# FR #5070 --- deploy-a-affiliates.ps1: WhatIf, exclude data/records, skip SKILLS.md by default.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$deploy = Join-Path $root 'tools\deploy-a-affiliates.ps1'

Describe 'FR #5070 deploy-a-affiliates.ps1' {
    It 'script exists and documents never-delete / WhatIf / Check' {
        (Test-Path -LiteralPath $deploy) | Should Be $true
        $raw = Get-Content -LiteralPath $deploy -Raw
        ($raw.Contains('Never deletes')) | Should Be $true
        ($raw.Contains('_invites/')) | Should Be $true
        ($raw.Contains('_applications/')) | Should Be $true
        ($raw.Contains('-WhatIf')) | Should Be $true
        ($raw.Contains('-Check')) | Should Be $true
        ($raw.Contains('--sse')) | Should Be $true
        ($raw.Contains('AES256')) | Should Be $true
        ($raw.Contains('Test-AAffiliatesDataOrRecordKey')) | Should Be $true
        ($raw -match 's3\s+sync[^\r\n]*--delete') | Should Be $false
    }

    It 'data/record key regex treats invites and merchant folders as forbidden' {
        $raw = Get-Content -LiteralPath $deploy -Raw
        ($raw.Contains('_invites')) | Should Be $true
        ($raw.Contains('_applications')) | Should Be $true
        ($raw.Contains('[0-9]+(/|$)')) | Should Be $true
    }

    It 'WhatIf plans puts for managed keys, skips SKILLS.md, writes nothing' {
        $out = & powershell -NoProfile -File $deploy -WhatIf -RepoRoot $root 2>&1 | ForEach-Object { "$_" }
        $text = $out -join "`n"
        ($text -match 'mode=WhatIf') | Should Be $true
        ($text -match 'whatif_done writes=0') | Should Be $true
        ($text -match 'skills_skipped_use_IncludeSkills') | Should Be $true
        ($text -match 'whatif aws .*--profile a-search-redqueen-agents s3 cp') | Should Be $true
        ($text -match 'awin/_invite/invite\.mjs') | Should Be $true
        ($text -match '--sse AES256') | Should Be $true
        ($text -match '--delete') | Should Be $false
        $skillsPuts = @($out | Where-Object { $_ -match 'whatif aws .*SKILLS\.md' })
        ($skillsPuts.Count) | Should Be 0
        $puts = @($out | Where-Object { $_ -match '^whatif aws ' })
        ($puts.Count) | Should Be 30
        $skips = @($out | Where-Object { $_ -match 'skills_skipped' })
        ($skips.Count) | Should Be 9
    }

    It 'WhatIf -IncludeSkills includes a SKILLS.md put' {
        $out = & powershell -NoProfile -File $deploy -WhatIf -IncludeSkills -RepoRoot $root 2>&1 | ForEach-Object { "$_" }
        $text = $out -join "`n"
        ($text -match 'whatif aws .*SKILLS\.md') | Should Be $true
        $puts = @($out | Where-Object { $_ -match '^whatif aws ' })
        ($puts.Count) | Should Be 39
    }

    It 'MANIFEST has no data/record keys' {
        $manifest = Get-Content -LiteralPath (Join-Path $root 'affiliates\MANIFEST.json') -Raw | ConvertFrom-Json
        foreach ($o in @($manifest.objects)) {
            $k = [string]$o.key
            ($k -match '_invites') | Should Be $false
            ($k -match '_applications') | Should Be $false
            ($k -match '^[a-z0-9._-]+/[0-9]+(/|$)') | Should Be $false
        }
        (@($manifest.objects).Count) | Should Be 39
    }
}
