<#
.SYNOPSIS
Show S3 folder marker metadata, tags, and object annotations for the mapped-S3 cwd (FR #4043).

.DESCRIPTION
Run inside D:\s3\<bucket>\... (or pass -Path). Prints metadata/tags on the zero-byte
folder marker and S3 object annotations (annotation, steering, ...). Secrets are
always masked. Read-only: never writes S3 or bumps lastmod.

.PARAMETER Path
Filesystem path under the S3 mount (default: cwd).

.PARAMETER MountRoot
Mount root (default D:\s3 or env A_SEARCH_S3_MOUNT).

.PARAMETER Json
Emit machine-readable JSON (email marked as PII; secrets masked).

.PARAMETER Full
Show complete annotation payloads (default truncates long ones).

.PARAMETER Backend
Force aws | rclone | auto for head-object / tagging.
#>
[CmdletBinding()]
param(
    [Alias('LiteralPath')][string]$Path,
    [string]$MountRoot,
    [switch]$Json,
    [switch]$Full,
    [ValidateSet('auto', 'aws', 'rclone')][string]$Backend = 'auto',
    [scriptblock]$AwsHeadObject,
    [scriptblock]$AwsGetObjectTagging,
    [scriptblock]$AwsListAnnotations,
    [scriptblock]$AwsGetAnnotation,
    [scriptblock]$RcloneLsJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
. (Join-Path $here 'FolderS3.ps1')

function Write-HumanMeta {
    param($Report)
    Write-Output ("folder: {0}" -f $Report.kind)
    Write-Output ("s3:     s3://{0}/{1}" -f $Report.bucket, $Report.key)
    Write-Output ("path:   {0}" -f $Report.path)
    Write-Output ("backend:{0}" -f $Report.backend)
    Write-Output ''
    Write-Output '--- metadata ---'
    if (-not $Report.metadata.Keys.Count) {
        Write-Output '(none)'
    }
    else {
        foreach ($k in ($Report.metadata.Keys | Sort-Object)) {
            Write-Output ("{0}={1}" -f $k, $Report.metadata[$k])
        }
    }
    Write-Output ''
    Write-Output '--- tags ---'
    if (-not $Report.tags.Keys.Count) {
        Write-Output '(none)'
    }
    else {
        foreach ($k in ($Report.tags.Keys | Sort-Object)) {
            Write-Output ("{0}={1}" -f $k, $Report.tags[$k])
        }
    }
    Write-Output ''
    Write-Output '--- annotations ---'
    if (-not $Report.annotations -or -not @($Report.annotations).Count) {
        Write-Output '(none)'
    }
    else {
        foreach ($a in @($Report.annotations)) {
            Write-Output ("[{0}] size={1} truncated={2}" -f $a.Name, $a.Size, $a.Truncated)
            Write-Output $a.Payload
            Write-Output ''
        }
    }
    if ($null -ne $Report.hostAnnotation) {
        Write-Output '--- parent host annotation ---'
        Write-Output ("[{0}] size={1} truncated={2}" -f $Report.hostAnnotation.Name, $Report.hostAnnotation.Size, $Report.hostAnnotation.Truncated)
        Write-Output $Report.hostAnnotation.Payload
    }
}

try {
    $target = if ($Path) { $Path } else { (Get-Location).Path }
    $loc = ConvertTo-FolderS3Location -Path $target -MountRoot $MountRoot
    # FR #4087: empty Key is bucket root (S:\a-clubs) — clear message, exit 5
    if ([string]::IsNullOrEmpty($loc.Key)) {
        throw ("bucket_root: s3://{0}/ is the bucket root; cd into a host/GUID/provider folder" -f $loc.Bucket)
    }
    $marker = Get-FolderS3ObjectMeta -Bucket $loc.Bucket -Key $loc.Key -Backend $Backend `
        -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
        -RcloneLsJson $RcloneLsJson

    $ann = Get-FolderS3Annotations -Bucket $loc.Bucket -Key $loc.Key -Full:$Full `
        -AwsListAnnotations $AwsListAnnotations -AwsGetAnnotation $AwsGetAnnotation

    $hostAnn = $null
    if ($loc.Kind -eq 'guid' -or $loc.Kind -eq 'guid-child') {
        $hostKey = Get-FolderS3ParentHostKey -Location $loc
        if ($hostKey) {
            $hostAnns = Get-FolderS3Annotations -Bucket $loc.Bucket -Key ($hostKey + '/') -Full:$Full `
                -AwsListAnnotations $AwsListAnnotations -AwsGetAnnotation $AwsGetAnnotation
            $hostAnn = @($hostAnns.Items) | Where-Object { $_.Name -eq 'annotation' } | Select-Object -First 1
            if (-not $hostAnn -and @($hostAnns.Items).Count) {
                $hostAnn = @($hostAnns.Items) | Select-Object -First 1
            }
        }
    }

    $displayMeta = Convert-FolderS3MetadataForDisplay -Metadata $marker.Metadata
    $displayTags = Convert-FolderS3MetadataForDisplay -Metadata $marker.Tags

    $annOut = @($ann.Items | ForEach-Object {
            [ordered]@{
                Name      = $_.Name
                Size      = $_.Size
                Truncated = $_.Truncated
                Payload   = $_.Payload
            }
        })

    $hostAnnOut = $null
    if ($hostAnn) {
        $hostAnnOut = [ordered]@{
            Name      = $hostAnn.Name
            Size      = $hostAnn.Size
            Truncated = $hostAnn.Truncated
            Payload   = $hostAnn.Payload
        }
    }

    if ($Json) {
        $jsonReport = [ordered]@{
            kind            = $loc.Kind
            bucket          = $loc.Bucket
            key             = $loc.Key
            path            = $loc.Path
            backend         = $marker.Backend
            metadata        = (Convert-FolderS3MetadataForJson -Metadata $marker.Metadata)
            tags            = (Convert-FolderS3MetadataForJson -Metadata $marker.Tags)
            annotations     = $annOut
            hostAnnotation  = $hostAnnOut
        }
        $jsonReport | ConvertTo-Json -Depth 10
    }
    else {
        $report = [ordered]@{
            kind           = $loc.Kind
            bucket         = $loc.Bucket
            key            = $loc.Key
            path           = $loc.Path
            backend        = $marker.Backend
            metadata       = $displayMeta
            tags           = $displayTags
            annotations    = $annOut
            hostAnnotation = $hostAnnOut
        }
        Write-HumanMeta -Report $report
    }
    exit 0
}
catch {
    $msg = $_.Exception.Message
    [Console]::Error.WriteLine($msg)
    if ($msg -match '^path_outside_mount') {
        exit 2
    }
    if ($msg -match '^bucket_root') {
        exit 5
    }
    exit 1
}
