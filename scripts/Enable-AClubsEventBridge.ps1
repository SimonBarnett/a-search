#Requires -Version 5.1
<#
.SYNOPSIS
  Enable Amazon EventBridge notifications on the a-clubs bucket (FR #4827).

.DESCRIPTION
  Reads the current bucket notification configuration and merges an empty
  EventBridgeConfiguration so Object Created events reach the CDK rules.
  Existing Topic/Queue/Lambda configurations are kept.
  Does not print credentials or profile secrets.

.PARAMETER Bucket
  Bucket name. Default a-clubs.

.PARAMETER Region
  AWS region. Default eu-west-2.

.PARAMETER AwsProfile
  Optional named profile (passed to aws --profile). The name is not a secret.

.PARAMETER WhatIf
  Print the notification JSON that would be put. Do not call put.
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
  # A bucket with no notification config returns an empty document or a client error.
  $cfg = New-Object psobject
}

if ($null -eq $cfg) { $cfg = New-Object psobject }

# ConvertFrom-Json on {} yields a PSCustomObject. Add the EventBridge member.
if ($cfg.PSObject.Properties.Name -contains 'EventBridgeConfiguration') {
  $cfg.EventBridgeConfiguration = New-Object psobject
} else {
  $cfg | Add-Member -NotePropertyName EventBridgeConfiguration -NotePropertyValue (New-Object psobject) -Force
}

$json = $cfg | ConvertTo-Json -Depth 20 -Compress
Write-Host "EventBridgeConfiguration set on s3://$Bucket ($Region)"

if ($WhatIf) {
  Write-Host '[DryRun] aws s3api put-bucket-notification-configuration'
  Write-Host $json
  return
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("a-clubs-notify-{0}.json" -f [guid]::NewGuid().ToString('n'))
try {
  [System.IO.File]::WriteAllText($tmp, $json)
  $putArgs = @(
    's3api', 'put-bucket-notification-configuration',
    '--bucket', $Bucket,
    '--region', $Region,
    '--notification-configuration', ("file://{0}" -f $tmp)
  )
  if ($AwsProfile) { $putArgs += @('--profile', $AwsProfile) }
  & aws @putArgs
  if ($LASTEXITCODE -ne 0) { throw "put-bucket-notification-configuration failed: $LASTEXITCODE" }
} finally {
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }
}

Write-Host "Enabled EventBridge on $Bucket"
