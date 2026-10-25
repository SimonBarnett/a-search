#Requires -Version 5.1
<#
.SYNOPSIS
  Read-only check: EventBridge notifications on the a-clubs bucket (FR #4890).

.DESCRIPTION
  EventBridge on a-clubs is enabled by the APartsGateway CDK stack
  (Bucket.fromBucketName + enableEventBridgeNotification, Managed=false merge).
  This script only checks whether EventBridgeConfiguration is present.
  It does not put or change bucket notification configuration.
  Does not print credentials or profile secrets.

.PARAMETER Bucket
  Bucket name. Default a-clubs.

.PARAMETER Region
  AWS region. Default eu-west-2.

.PARAMETER AwsProfile
  Optional named profile (passed to aws --profile). The name is not a secret.

.PARAMETER WhatIf
  Same as the default check path (no writes). Kept for callers that already pass -WhatIf.
#>
[CmdletBinding()]
param(
  [string]$Bucket = 'a-clubs',
  [string]$Region = 'eu-west-2',
  [string]$AwsProfile,
  [Alias('DryRun')][switch]$WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-AwsJson {
  param([string[]]$AwsArgs)
  $out = & aws @AwsArgs 2>&1
  $code = $LASTEXITCODE
  $text = ($out | Out-String).Trim()
  if ($code -ne 0) {
    throw "aws_failed:${code}:$text"
  }
  if (-not $text) { return @{} }
  return ($text | ConvertFrom-Json)
}

$getArgs = @(
  's3api', 'get-bucket-notification-configuration',
  '--bucket', $Bucket,
  '--region', $Region,
  '--output', 'json'
)
if ($AwsProfile) {
  $getArgs += @('--profile', $AwsProfile)
}

$cfg = $null
try {
  $cfg = Invoke-AwsJson -AwsArgs $getArgs
} catch {
  $msg = "$_"
  if ($msg -match 'NoSuchBucket') { throw }
  $cfg = New-Object psobject
}

if ($null -eq $cfg) { $cfg = New-Object psobject }

$enabled = $cfg.PSObject.Properties.Name -contains 'EventBridgeConfiguration'
if ($WhatIf) {
  Write-Host "[check only] EventBridgeConfiguration on s3://$Bucket ($Region): $(if ($enabled) { 'present' } else { 'missing' })"
} else {
  Write-Host "EventBridgeConfiguration on s3://$Bucket ($Region): $(if ($enabled) { 'present' } else { 'missing' })"
}

if (-not $enabled) {
  Write-Host 'Enable via CDK: npm run deploy:parts-gateway (APartsGateway FR #4890). This script is read-only.'
  exit 1
}

Write-Host 'OK: EventBridge already enabled (CDK-managed merge).'
exit 0
