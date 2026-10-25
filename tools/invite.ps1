<#
.SYNOPSIS
Provider invite dispatcher for a-affiliates (Awin + Rakuten + CJ).

.DESCRIPTION
From bucket root: run invite for every provider with enabled=1.
From a provider folder: run that provider's invite when enabled=1.
An enabled provider MUST have a registered invite backend; otherwise
invite_not_implemented (exit 4).

Backends: {provider}/_invite/ + config.json (agentRoot / entry / runFromAgentRoot).
Awin: Playwright Join Programmes. CJ: Advertiser Lookup + Account Manager apply (FR #5066).
Default is dry-run; pass -Live to submit. Exit 2 = needs OTP.
Exit 5 = cj_account_not_active (publisher not authorised).

.PARAMETER Path
Filesystem path under the S3 mount (default: cwd).

.PARAMETER Live
Submit joins. Default dry-run (fill modal, cancel; no _invites write).

.PARAMETER Max
Cap invites this run per provider (default AWIN_MAX_JOINS or 20).

.PARAMETER Headed
Show the browser window.

.PARAMETER Otp
One-shot OTP code (also accepts env AWIN_OTP / provider OTP).
#>
[CmdletBinding()]
param(
    [Alias('LiteralPath')][string]$Path,
    [string]$MountRoot,
    [switch]$Live,
    [switch]$Headed,
    [int]$Max = 0,
    [string]$Otp
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
. (Join-Path $here 'FolderS3.ps1')

# Providers that have an invite implementation under {provider}/_invite/.
# enabled=1 without _invite => invite_not_implemented.
# CJ stays enabled=0 on the marker until #5057 activation.
# Rakuten from FR #5065; CJ from FR #5066.
$script:InviteProviders = @('awin', 'rakuten', 'cj')

function Get-InviteProviderNames {
    param([string]$Bucket)
    $names = New-Object 'System.Collections.Generic.List[string]'
    $token = $null
    do {
        $awsArgs = @(
            's3api', 'list-objects-v2',
            '--bucket', $Bucket,
            '--delimiter', '/',
            '--output', 'json'
        )
        if ($token) { $awsArgs += @('--continuation-token', $token) }
        $raw = & aws @awsArgs 2>&1
        if ($LASTEXITCODE -ne 0) { throw ("list_providers_failed: {0}" -f $raw) }
        $j = ConvertFrom-FolderS3Json $raw
        if (-not $j) { throw 'list_providers_failed: empty json' }
        foreach ($p in @($j.CommonPrefixes)) {
            $pref = [string]$p.Prefix
            if ($pref -match '^([a-z][a-z0-9-]*)/$') {
                $name = $Matches[1]
                if ($name.StartsWith('_') -or $name.StartsWith('.')) { continue }
                $names.Add($name)
            }
        }
        $token = $null
        $nctProp = $j.PSObject.Properties['NextContinuationToken']
        if ($nctProp -and $nctProp.Value) { $token = [string]$nctProp.Value }
    } while ($token)
    return @($names | Sort-Object -Unique)
}

function Get-InviteProviderEnabled {
    param([string]$Bucket, [string]$Provider)
    $marker = Get-FolderS3ObjectMeta -Bucket $Bucket -Key ("{0}/" -f $Provider) -Backend aws -SkipTags
    $meta = @{}
    if ($marker -and $marker.Metadata) {
        foreach ($k in $marker.Metadata.Keys) {
            $meta[[string]$k] = [string]$marker.Metadata[$k]
        }
    }
    $enabled = ([string]$meta['enabled']).Trim() -eq '1'
    return [pscustomobject]@{ Enabled = $enabled; Meta = $meta }
}

function Resolve-InviteProviderRoots {
    param([string]$Provider, [string]$MountRoot)
    $slug = $Provider.ToLowerInvariant()
    $mount = if ($MountRoot) { $MountRoot } else { (Get-FolderS3MountRoot) }
    $providerPath = Join-Path $mount ("a-affiliates\" + $slug)
    $inviteRoot = Join-Path $providerPath '_invite'
    $cfgPath = Join-Path $inviteRoot 'config.json'
    $cfg = $null
    if (Test-Path -LiteralPath $cfgPath) {
        $cfg = Get-Content -LiteralPath $cfgPath -Raw | ConvertFrom-Json
    }
    if ($slug -eq 'cj') { $agentRoot = 'C:\ai\a-search\cj-invite' }
    elseif ($slug -eq 'rakuten') { $agentRoot = 'C:\ai\a-search' }
    else { $agentRoot = 'C:\ai\a-search\awin-agent' }
    if ($cfg -and $cfg.agentRoot) { $agentRoot = [string]$cfg.agentRoot }
    $entry = 'invite.mjs'
    if ($cfg -and $cfg.entry) { $entry = [string]$cfg.entry }
    $runFromAgent = $false
    if ($cfg -and $cfg.PSObject.Properties['runFromAgentRoot'] -and [bool]$cfg.runFromAgentRoot) {
        $runFromAgent = $true
    }
    if ($slug -eq 'cj') { $runFromAgent = $true }
    $script = if ($runFromAgent) { Join-Path $agentRoot $entry } else { Join-Path $inviteRoot $entry }
    $reportDir = Join-Path 'C:\ai\a-search\logs' ("{0}-invite" -f $slug)
    if ($cfg -and $cfg.reportDir) { $reportDir = [string]$cfg.reportDir }

    # Provider-specific env from config (never print values).
    if ($slug -eq 'awin') {
        if ($cfg -and $cfg.profile) { $env:AWIN_PROFILE = [string]$cfg.profile }
        if ($cfg -and $cfg.secretFile) { $env:AWIN_SECRET_FILE = [string]$cfg.secretFile }
        if ($cfg -and $cfg.publisherId) { $env:AWIN_PUBLISHER_ID = [string]$cfg.publisherId }
    }
    elseif ($slug -eq 'cj') {
        if ($cfg -and $cfg.secretFile) { $env:CJ_SECRET_FILE = [string]$cfg.secretFile }
        if ($cfg -and $cfg.companyId) { $env:CJ_COMPANY_ID = [string]$cfg.companyId }
        if ($cfg -and $cfg.websiteId) { $env:CJ_WEBSITE_ID = [string]$cfg.websiteId }
        if ($cfg -and $cfg.reportDir) { $env:CJ_INVITE_REPORT_DIR = [string]$cfg.reportDir }
        if ($cfg -and $cfg.lockPath) { $env:CJ_INVITE_LOCK = [string]$cfg.lockPath }
    }
    elseif ($slug -eq 'rakuten') {
        if ($cfg -and $cfg.secretFile) { $env:RAKUTEN_SECRET_FILE = [string]$cfg.secretFile }
        if ($cfg -and $cfg.publisherId) { $env:RAKUTEN_PUBLISHER_ID = [string]$cfg.publisherId }
        if ($cfg -and $cfg.profile) { $env:RAKUTEN_PROFILE = [string]$cfg.profile }
        $env:RAKUTEN_USE_INVITE = '1'
    }

    return [pscustomobject]@{
        Provider   = $slug
        InviteRoot = $inviteRoot
        Script     = $script
        AgentRoot  = $agentRoot
        ReportDir  = $reportDir
        Cfg        = $cfg
    }
}

function Write-InviteReportSummary {
    param([string]$Provider = 'awin', [string]$ReportDir)
    $slug = if ($Provider) { $Provider.ToLowerInvariant() } else { 'awin' }
    $dir = if ($ReportDir) { $ReportDir } else { Join-Path 'C:\ai\a-search\logs' ("{0}-invite" -f $slug) }
    $reportPath = Join-Path $dir ((Get-Date).ToString('yyyy-MM-dd') + '.json')
    if (-not (Test-Path -LiteralPath $reportPath)) {
        [Console]::Error.WriteLine('         (no invite report file yet)')
        return
    }
    try {
        $r = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
    }
    catch {
        [Console]::Error.WriteLine(('         (could not read report {0})' -f $reportPath))
        return
    }
    $signIn = '?'
    $otpError = $null
    if ($r.signIn) {
        if ($r.signIn.PSObject.Properties['status']) { $signIn = [string]$r.signIn.status }
        if ($r.signIn.PSObject.Properties['error'] -and $r.signIn.error) {
            $otpError = [string]$r.signIn.error
        }
    }
    if ($r.PSObject.Properties['otpError'] -and $r.otpError) {
        $otpError = [string]$r.otpError
    }
    if ($r.PSObject.Properties['error'] -and $r.error) {
        $otpError = [string]$r.error
    }
    $counts = $null
    if ($r.PSObject.Properties['counts']) { $counts = $r.counts }
    $cand = 0; $app = 0; $fail = 0
    if ($counts) {
        if ($counts.PSObject.Properties['candidates']) { $cand = [int]$counts.candidates }
        if ($counts.PSObject.Properties['applied']) { $app = [int]$counts.applied }
        if ($counts.PSObject.Properties['failed']) { $fail = [int]$counts.failed }
    }
    $line = 'invite_result provider={0} signIn={1} live={2} candidates={3} applied={4} failed={5} needsOtp={6} report={7}' -f `
        $slug,
        $signIn,
        [bool]$r.live,
        $cand,
        $app,
        $fail,
        [bool]$r.needsOtp,
        $reportPath
    [Console]::Error.WriteLine(('         {0}' -f $line))
    Write-Output $line
    if ($otpError) {
        [Console]::Error.WriteLine(('         detail={0}' -f $otpError))
    }
}

function Invoke-RegisteredInvite {
    param(
        [Parameter(Mandatory = $true)][string]$Provider,
        [switch]$Live,
        [switch]$Headed,
        [int]$Max,
        [string]$Otp,
        [string]$MountRoot
    )
    $roots = Resolve-InviteProviderRoots -Provider $Provider -MountRoot $MountRoot
    $slug = $roots.Provider
    if (-not (Test-Path -LiteralPath $roots.InviteRoot)) {
        # CJ may run from agentRoot before S3 _invite is uploaded; still require config or agent entry.
        if ($slug -ne 'cj' -or -not (Test-Path -LiteralPath $roots.Script)) {
            [Console]::Error.WriteLine(("invite_not_implemented: {0} missing _invite/ at {1}" -f $slug, $roots.InviteRoot))
            return 4
        }
    }
    if (-not (Test-Path -LiteralPath $roots.Script)) {
        [Console]::Error.WriteLine(("invite_script_missing: {0}" -f $roots.Script))
        return 1
    }

    if ($Otp) {
        if ($slug -eq 'awin') { $env:AWIN_OTP = $Otp }
        else { $env:INVITE_OTP = $Otp }
    }
    if (-not $env:AWS_PROFILE) { $env:AWS_PROFILE = 'a-search-redqueen-agents' }

    $nodeArgs = @($roots.Script)
    if ($Live) { $nodeArgs += '--live' }
    if ($Headed) { $nodeArgs += '--headed' }
    if ($Max -gt 0) { $nodeArgs += ("--max={0}" -f $Max) }

    $mode = if ($Live) { 'LIVE (will submit joins)' } else { 'dry-run (pass -Live to submit joins)' }
    [Console]::Error.WriteLine(('[{0}] invite provider={1} mode={2} max={3} otp={4} entry={5}' -f `
                (Get-Date).ToString('HH:mm:ss'),
                $slug,
                $mode,
                $(if ($Max -gt 0) { $Max } else { '(default)' }),
                $(if ($Otp) { 'set' } else { 'none' }),
                $roots.Script))

    Push-Location $roots.AgentRoot
    try {
        & node @nodeArgs
        $code = [int]$LASTEXITCODE
        Write-InviteReportSummary -Provider $slug -ReportDir $roots.ReportDir
        return $code
    }
    finally {
        Pop-Location
        if ($Otp) {
            Remove-Item Env:AWIN_OTP -ErrorAction SilentlyContinue
            Remove-Item Env:INVITE_OTP -ErrorAction SilentlyContinue
        }
    }
}

function Invoke-ProviderInvite {
    param(
        [Parameter(Mandatory = $true)][string]$Provider,
        [switch]$Live,
        [switch]$Headed,
        [int]$Max,
        [string]$Otp,
        [string]$MountRoot
    )
    $slug = $Provider.ToLowerInvariant()
    if ($script:InviteProviders -notcontains $slug) {
        [Console]::Error.WriteLine(("invite_not_implemented: {0} is enabled=1 but has no invite backend" -f $slug))
        return 4
    }
    return (Invoke-RegisteredInvite -Provider $slug -Live:$Live -Headed:$Headed -Max $Max -Otp $Otp -MountRoot $MountRoot)
}

try {
    $target = if ($Path) { $Path } else { (Get-Location).Path }
    $loc = ConvertTo-FolderS3Location -Path $target -MountRoot $MountRoot

    if ($loc.Bucket.ToLowerInvariant() -ne 'a-affiliates') {
        [Console]::Error.WriteLine(("not_a_affiliates: invite only works under a-affiliates (got bucket={0} kind={1})" -f $loc.Bucket, $loc.Kind))
        exit 3
    }

    if ($loc.Kind -notin @('a-affiliates-root', 'provider')) {
        [Console]::Error.WriteLine(("invite_cwd: run from S:\a-affiliates or S:\a-affiliates\{{provider}} (got kind={0})" -f $loc.Kind))
        exit 3
    }

    if (-not $env:AWS_PROFILE) { $env:AWS_PROFILE = 'a-search-redqueen-agents' }

    if ($loc.Kind -eq 'provider') {
        $pname = $loc.KeyParts[0]
        [Console]::Error.WriteLine(('[{0}] Reading provider marker {1}/' -f (Get-Date).ToString('HH:mm:ss'), $pname))
        $st = Get-InviteProviderEnabled -Bucket $loc.Bucket -Provider $pname
        if (-not $st.Enabled) {
            [Console]::Error.WriteLine(("provider_disabled: {0} has enabled!=1" -f $pname))
            exit 3
        }
        $code = Invoke-ProviderInvite -Provider $pname -Live:$Live -Headed:$Headed -Max $Max -Otp $Otp -MountRoot $loc.MountRoot
        exit $code
    }

    # Bucket root: every enabled=1 provider
    [Console]::Error.WriteLine(('[{0}] Listing providers under a-affiliates/' -f (Get-Date).ToString('HH:mm:ss')))
    $providerNames = @(Get-InviteProviderNames -Bucket $loc.Bucket)
    $enabled = @()
    foreach ($pn in $providerNames) {
        $st = Get-InviteProviderEnabled -Bucket $loc.Bucket -Provider $pn
        if ($st.Enabled) {
            $enabled += $pn
            [Console]::Error.WriteLine(('         provider {0} enabled=1' -f $pn))
        }
        else {
            [Console]::Error.WriteLine(('         provider {0} enabled=0 - skip' -f $pn))
        }
    }

    if ($enabled.Count -eq 0) {
        Write-Output 'no_enabled_providers'
        exit 0
    }

    $worst = 0
    $needOtp = $false
    $failed = @()
    foreach ($pn in $enabled) {
        $code = Invoke-ProviderInvite -Provider $pn -Live:$Live -Headed:$Headed -Max $Max -Otp $Otp -MountRoot $loc.MountRoot
        if ($code -eq 2) { $needOtp = $true }
        elseif ($code -ne 0) {
            $failed += ("{0}:{1}" -f $pn, $code)
            if ($code -gt $worst) { $worst = $code }
        }
    }

    if ($needOtp) {
        Write-Output ("invite_summary needs_otp providers={0}" -f ($enabled -join ','))
        exit 2
    }
    if ($failed.Count) {
        Write-Output ("invite_summary failed={0}" -f ($failed -join ','))
        exit $(if ($worst -ne 0) { $worst } else { 1 })
    }
    Write-Output ("invite_summary ok providers={0}" -f ($enabled -join ','))
    exit 0
}
catch {
    $msg = $_.Exception.Message
    $safe = $msg -replace '(?i)(api[_-]?key|token|password|secret|feedurl)\s*[:=]\s*\S+', '$1=***'
    [Console]::Error.WriteLine($safe)
    if ($safe -match '^path_outside_mount') { exit 3 }
    exit 1
}
