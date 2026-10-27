# FR #5206 --- invite -Max 3 dry-run: StrictMode-safe config + run awin invite from awin-agent (playwright).

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$tools = Join-Path $root 'tools'
$invitePs1 = Join-Path $tools 'invite.ps1'
$awinInvite = Join-Path $root 'redqueen\awin-agent\scripts\invite.mjs'

Describe 'FR #5206 invite awin agent-root + StrictMode config' {
    It 'invite.ps1 defines Test-InviteCfgValue for optional reportDir' {
        $raw = Get-Content -LiteralPath $invitePs1 -Raw
        ($raw.Contains('function Test-InviteCfgValue')) | Should Be $true
        ($raw.Contains("Test-InviteCfgValue `$cfg 'reportDir'")) | Should Be $true
        # Must not StrictMode-touch missing reportDir via bare `$cfg.reportDir`.
        ($raw.Contains('if ($cfg -and $cfg.reportDir)')) | Should Be $false
    }

    It 'awin defaults to runFromAgentRoot scripts/invite.mjs (playwright next to agent)' {
        $raw = Get-Content -LiteralPath $invitePs1 -Raw
        ($raw.Contains("slug -eq 'awin'")) | Should Be $true
        ($raw.Contains('scripts/invite.mjs')) | Should Be $true
        ($raw.Contains('$runFromAgent = $true')) | Should Be $true
        ($raw.Contains('FR #5206')) | Should Be $true
    }

    It 'awin-agent scripts/invite.mjs is real Playwright entry not MOVED stub' {
        (Test-Path -LiteralPath $awinInvite) | Should Be $true
        $raw = Get-Content -LiteralPath $awinInvite -Raw
        ($raw -match "from 'playwright'") | Should Be $true
        ($raw -notmatch 'invite_moved:') | Should Be $true
        ($raw -match 'AFFILIATES_ROOT') | Should Be $true
    }

    It 'Test-InviteCfgValue is StrictMode-safe for missing reportDir' {
        Set-StrictMode -Version Latest
        function Test-InviteCfgValue {
            param($Cfg, [string]$Name)
            if (-not $Cfg) { return $false }
            $prop = $Cfg.PSObject.Properties[$Name]
            return [bool]($prop -and $prop.Value)
        }
        $cfg = [pscustomobject]@{ agentRoot = 'C:\ai\a-search\awin-agent'; entry = 'invite.mjs' }
        { $null = Test-InviteCfgValue $cfg 'reportDir' } | Should Not Throw
        (Test-InviteCfgValue $cfg 'reportDir') | Should Be $false
        (Test-InviteCfgValue $cfg 'agentRoot') | Should Be $true
    }
}
