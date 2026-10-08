<#
.SYNOPSIS
  List or remove a-search S3 artifacts for a removed user/partner/club code (FR-118).

.DESCRIPTION
  Scans results, _mapping, and _reports prefixes for a tenant userId.
  Default is dry-run (list only). Pass -ConfirmDelete to delete listed object keys.
  madeiradb row deletes stay DBA-only (see docs/partner-removal.md).

.PARAMETER UserId
  8-char Madeira code (or any tenant segment used in S3 keys).

.PARAMETER Env
  live | sandbox | all

.PARAMETER Bucket
  S3 bucket (default env S3_RESULTS_BUCKET).

.PARAMETER DryRun
  List keys only (default when -ConfirmDelete is omitted).

.PARAMETER ConfirmDelete
  Actually delete listed keys after listing.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)]
  [string] $UserId,

  [ValidateSet('live', 'sandbox', 'all')]
  [string] $Env = 'live',

  [string] $Bucket = $env:S3_RESULTS_BUCKET,

  [switch] $DryRun,

  [switch] $ConfirmDelete
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$code = $UserId.Trim().ToUpperInvariant()
if (-not $code) { throw 'UserId is required' }
if (-not $Bucket) { throw 'Bucket required (pass -Bucket or set S3_RESULTS_BUCKET)' }

$doDelete = [bool]$ConfirmDelete
if (-not $doDelete) { $DryRun = $true }

$envs = if ($Env -eq 'all') { @('live', 'sandbox') } else { @($Env) }

function Get-AwsCli {
  $cmd = Get-Command aws -ErrorAction SilentlyContinue
  if (-not $cmd) { throw 'aws CLI not found on PATH (needed to list/delete S3 keys)' }
  return $cmd.Source
}

function List-PrefixKeys {
  param([string] $Prefix)
  $aws = Get-AwsCli
  $keys = New-Object System.Collections.Generic.List[string]
  $token = $null
  do {
    $args = @(
      's3api', 'list-objects-v2',
      '--bucket', $Bucket,
      '--prefix', $Prefix,
      '--output', 'json'
    )
    if ($token) { $args += @('--continuation-token', $token) }
    $json = & $aws @args 2>&1
    if ($LASTEXITCODE -ne 0) { throw "list-objects-v2 failed for prefix $Prefix : $json" }
    $obj = $json | ConvertFrom-Json
    foreach ($c in @($obj.Contents)) {
      if ($c -and $c.Key) { [void]$keys.Add([string]$c.Key) }
    }
    if ($obj.IsTruncated) { $token = $obj.NextContinuationToken } else { $token = $null }
  } while ($token)
  return $keys
}

$listed = New-Object System.Collections.Generic.List[string]

foreach ($e in $envs) {
  $mapPrefix = "$e/_mapping/$code/"
  Write-Host "LIST mapping $mapPrefix"
  foreach ($k in (List-PrefixKeys -Prefix $mapPrefix)) { [void]$listed.Add($k) }

  # Results layout: {env}/{source}/{userId}/...
  # List env root then filter path segments (avoid deleting other tenants).
  $envPrefix = "$e/"
  Write-Host "LIST results under $envPrefix matching /$code/"
  foreach ($k in (List-PrefixKeys -Prefix $envPrefix)) {
    if ($k -match '(^|/)_mapping/' -or $k -match '(^|/)_reports/' -or $k -match '(^|/)_staging/') {
      continue
    }
    # segment after env/source/
    $parts = $k.Split('/')
    if ($parts.Length -ge 3 -and $parts[0] -eq $e -and $parts[2].ToUpperInvariant() -eq $code) {
      [void]$listed.Add($k)
    }
  }

  $repPrefix = "$e/_reports/"
  Write-Host "LIST reports $repPrefix (filter signup user_id=$code in dry-run notes)"
  foreach ($k in (List-PrefixKeys -Prefix $repPrefix)) {
    if ($k -like "*.json") {
      # Always list report keys that mention the code in the key path; body filter needs GetObject (ops).
      if ($k.ToUpperInvariant().Contains($code)) {
        [void]$listed.Add($k)
      } else {
        # Tag for ops: report files may contain the user_id inside JSON — print hint once per env
      }
    }
  }
  Write-Host "NOTE: signup rows live inside $e/_reports/{source}/{day}/signups.json — open matching day files and strip user_id=$code (script lists path hits only)."
}

$unique = $listed | Select-Object -Unique | Sort-Object
Write-Host ("KEYS {0}" -f $unique.Count)
$unique | ForEach-Object { Write-Host $_ }

if ($DryRun -and -not $doDelete) {
  Write-Host 'DryRun complete (no objects removed). Re-run with -ConfirmDelete after review.'
  return
}

if (-not $doDelete) { return }

$aws = Get-AwsCli
foreach ($k in $unique) {
  if ($PSCmdlet.ShouldProcess($k, "Remove S3 object s3://$Bucket/$k")) {
    & $aws s3api delete-object --bucket $Bucket --key $k | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "delete-object failed for $k" }
    Write-Host "REMOVED $k"
  }
}
