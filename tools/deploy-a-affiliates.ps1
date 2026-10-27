#Requires -Version 5.1
<#
.SYNOPSIS
  Deploy git-managed a-affiliates code objects from affiliates/bucket/ to s3://a-affiliates/ (FR #5070).
.DESCRIPTION
  Git is the source of truth for code/config/agent-instruction keys listed in affiliates/MANIFEST.json.
  Default is -WhatIf (print planned puts; write nothing). -Check reports drift vs S3 (HeadObject size/ETag).
  -Apply performs aws s3 cp --sse AES256 for managed keys only.

  Never deletes. Never touches data/records prefixes (_invites/, _applications/, merchant folders
  {provider}/{id}/, or keys outside the MANIFEST). Runtime-written SKILLS.md files are skipped unless
  -IncludeSkills (prefer pull S3 back into git rather than overwrite agent-added entries).
.NOTES
  Profile default: a-search-redqueen-agents (import profile). Pass -AwsProfile to override.
  PowerShell 5.1 only. Never prints secrets.
#>
[CmdletBinding(DefaultParameterSetName = 'WhatIf')]
param(
    [Parameter(ParameterSetName = 'WhatIf')]
    [switch]$WhatIf,

    [Parameter(ParameterSetName = 'Check')]
    [switch]$Check,

    [Parameter(ParameterSetName = 'Apply')]
    [switch]$Apply,

    [string]$Bucket = 'a-affiliates',
    [string]$AwsProfile = 'a-search-redqueen-agents',
    [string]$RepoRoot = '',
    [switch]$IncludeSkills
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $WhatIf -and -not $Check -and -not $Apply) { $WhatIf = $true }

function Test-AAffiliatesDataOrRecordKey {
    param([Parameter(Mandatory)][string]$Key)
    $k = $Key.Replace('\', '/').TrimStart('/')
    if ($k -match '(^|/)_invites(/|$)') { return $true }
    if ($k -match '(^|/)_applications(/|$)') { return $true }
    # Merchant folder: provider/{digits}/... (feeds/markers), not provider/_invite or _import
    if ($k -match '^[a-z0-9._-]+/[0-9]+(/|$)') { return $true }
    if ($k -match '(^|/)\.env$') { return $true }
    return $false
}

function Test-AAffiliatesSkillsKey {
    param([Parameter(Mandatory)][string]$Key)
    $k = $Key.Replace('\', '/').TrimStart('/')
    return ($k -eq 'SKILLS.md' -or $k -match '/SKILLS\.md$')
}

function Get-AAffiliatesManagedObjects {
    param([Parameter(Mandatory)][string]$Root)
    $manifestPath = Join-Path $Root 'affiliates\MANIFEST.json'
    if (-not (Test-Path -LiteralPath $manifestPath)) {
        throw ("missing_manifest: {0}" -f $manifestPath)
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $manifest.objects) { throw 'manifest_empty_objects' }
    $bucketDir = Join-Path $Root 'affiliates\bucket'
    $out = @()
    foreach ($o in @($manifest.objects)) {
        $key = [string]$o.key
        if (-not $key) { throw 'manifest_object_missing_key' }
        if (Test-AAffiliatesDataOrRecordKey -Key $key) {
            throw ("manifest_lists_forbidden_data_key: {0}" -f $key)
        }
        if ((-not $IncludeSkills) -and (Test-AAffiliatesSkillsKey -Key $key)) {
            $out += [pscustomobject]@{
                Key        = $key
                LocalPath  = $null
                Size       = [int64]$o.size
                ETag       = [string]$o.ETag
                Sha256     = [string]$o.sha256
                SkipReason = 'skills_skipped_use_IncludeSkills'
            }
            continue
        }
        $rel = $key.Replace('/', [IO.Path]::DirectorySeparatorChar)
        $local = Join-Path $bucketDir $rel
        if (-not (Test-Path -LiteralPath $local)) {
            throw ("missing_local_blob: {0}" -f $local)
        }
        $out += [pscustomobject]@{
            Key        = $key
            LocalPath  = $local
            Size       = [int64]$o.size
            ETag       = [string]$o.ETag
            Sha256     = [string]$o.sha256
            SkipReason = ''
        }
    }
    return @($out)
}

function New-AAffiliatesPutArgv {
    param(
        [Parameter(Mandatory)][string]$LocalPath,
        [Parameter(Mandatory)][string]$BucketName,
        [Parameter(Mandatory)][string]$Key,
        [Parameter(Mandatory)][string]$Profile
    )
    # FR #5174: always pass --profile. SSE-S3 AES256. Never --delete.
    return @(
        '--profile', $Profile,
        's3', 'cp', $LocalPath, ('s3://{0}/{1}' -f $BucketName, $Key),
        '--sse', 'AES256'
    )
}

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$cliProfile = if ($AwsProfile -and $AwsProfile.Trim()) { $AwsProfile.Trim() } else { 'a-search-redqueen-agents' }

$managed = @(Get-AAffiliatesManagedObjects -Root $RepoRoot)
$toPut = @($managed | Where-Object { -not $_.SkipReason })
$skipped = @($managed | Where-Object { $_.SkipReason })

Write-Output ('deploy_a_affiliates mode={0} bucket={1} profile={2} managed={3} put={4} skipped={5}' -f `
    $(if ($Apply) { 'Apply' } elseif ($Check) { 'Check' } else { 'WhatIf' }),
    $Bucket, $cliProfile, $managed.Count, $toPut.Count, $skipped.Count)

foreach ($s in $skipped) {
    Write-Output ('skip key={0} reason={1}' -f $s.Key, $s.SkipReason)
}

if ($WhatIf) {
    foreach ($row in $toPut) {
        $argv = New-AAffiliatesPutArgv -LocalPath $row.LocalPath -BucketName $Bucket -Key $row.Key -Profile $cliProfile
        Write-Output ('whatif aws {0}' -f ($argv -join ' '))
    }
    Write-Output 'whatif_done writes=0'
    exit 0
}

if ($Check) {
    $drift = 0
    $missing = 0
    foreach ($row in $toPut) {
        $headArgs = @('--profile', $cliProfile, 's3api', 'head-object', '--bucket', $Bucket, '--key', $row.Key, '--output', 'json')
        $raw = & aws @headArgs 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Output ('drift missing key={0}' -f $row.Key)
            $missing++
            $drift++
            continue
        }
        $head = $raw | Out-String | ConvertFrom-Json
        $remoteSize = [int64]$head.ContentLength
        $remoteEtag = ([string]$head.ETag).Trim('"')
        $localSize = (Get-Item -LiteralPath $row.LocalPath).Length
        if ($remoteSize -ne $localSize) {
            Write-Output ('drift size key={0} remote={1} local={2}' -f $row.Key, $remoteSize, $localSize)
            $drift++
        }
        elseif ($row.ETag -and $remoteEtag -and ($remoteEtag.ToLowerInvariant() -ne $row.ETag.ToLowerInvariant())) {
            Write-Output ('drift etag_vs_manifest key={0} remote={1} manifest={2}' -f $row.Key, $remoteEtag, $row.ETag)
            $drift++
        }
        else {
            Write-Output ('ok key={0} size={1}' -f $row.Key, $localSize)
        }
    }
    Write-Output ('check_done drift={0} missing={1}' -f $drift, $missing)
    if ($drift -gt 0) { exit 2 }
    exit 0
}

# Apply
$wrote = 0
foreach ($row in $toPut) {
    $argv = New-AAffiliatesPutArgv -LocalPath $row.LocalPath -BucketName $Bucket -Key $row.Key -Profile $cliProfile
    Write-Output ('apply aws {0}' -f ($argv -join ' '))
    & aws @argv
    if ($LASTEXITCODE -ne 0) { throw ("aws_cp_failed key={0} exit={1}" -f $row.Key, $LASTEXITCODE) }
    $wrote++
}
Write-Output ('apply_done writes={0}' -f $wrote)
exit 0
