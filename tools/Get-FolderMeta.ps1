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

.PARAMETER AwsProfile
AWS profile for head-object / tagging / annotations (FR #5148 / #5164). Precedence:
-AwsProfile, then AwsProfile in search.config.json next to this script, then
a-search-redqueen-annotator. Does NOT use A_SEARCH_AGENTS_AWS_PROFILE or AWS_PROFILE
(those identities lack a-clubs read on redqueen).
#>
[CmdletBinding()]
param(
    [Alias('LiteralPath')][string]$Path,
    [string]$MountRoot,
    [switch]$Json,
    [switch]$Full,
    [ValidateSet('auto', 'aws', 'rclone')][string]$Backend = 'auto',
    [string]$AwsProfile,
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
. (Join-Path $here 'FolderProgress.ps1')
. (Join-Path $here 'ToolFailure.ps1')


function Get-FolderMetaSearchConfig {
    # FR #5164: reuse search.config.json next to meta / Get-FolderMeta.ps1.
    param([string]$ConfigPath)
    $candidates = @()
    if ($ConfigPath) { $candidates += $ConfigPath }
    if ($env:A_SEARCH_FOLDER_TOOLS_CONFIG) { $candidates += $env:A_SEARCH_FOLDER_TOOLS_CONFIG }
    $candidates += (Join-Path $here 'search.config.json')
    foreach ($c in $candidates) {
        if ($c -and (Test-Path -LiteralPath $c)) {
            try {
                return (Get-Content -LiteralPath $c -Raw -Encoding UTF8 | ConvertFrom-Json)
            } catch {
                return $null
            }
        }
    }
    return $null
}

function Resolve-FolderMetaAwsProfile {
    # FR #5164: -AwsProfile, then search.config.json AwsProfile, then annotator.
    # Never agents or process AWS profile env (those lack a-clubs read on redqueen).
    param(
        [string]$AwsProfile,
        $Config
    )
    if ($AwsProfile) { return $AwsProfile }
    if ($Config -and $Config.PSObject.Properties['AwsProfile']) {
        $p = [string]$Config.AwsProfile
        if ($p -and $p.Trim()) { return $p.Trim() }
    }
    return 'a-search-redqueen-annotator'
}

function Get-MarkerMetaValue {
    param($Metadata, [string]$Name)
    if (-not $Metadata) { return '' }
    foreach ($k in @($Metadata.Keys)) {
        if ($k -and ([string]$k).ToLowerInvariant() -eq $Name.ToLowerInvariant()) {
            if ($null -eq $Metadata[$k]) { return '' }
            return [string]$Metadata[$k]
        }
    }
    return ''
}

function Get-NamedFolderAnnotation {
    param($Items, [string]$Name)
    return @($Items) | Where-Object { $_.Name -eq $Name } | Select-Object -First 1
}

function New-FolderReviewField {
    param($Ann, [string]$Annotated, [string]$LastUpdate)
    if (-not $Ann) { return $null }
    $text = ''
    $names = @($Ann.PSObject.Properties.Name)
    if (($names -contains 'FullPayload') -and $null -ne $Ann.FullPayload) {
        $text = [string]$Ann.FullPayload
    }
    elseif ($null -ne $Ann.Payload) {
        $text = [string]$Ann.Payload
    }
    return [ordered]@{
        text       = $text
        annotated  = $Annotated
        lastupdate = $LastUpdate
    }
}

function Read-LegacyReviewFile {
    param([string]$FilePath)
    if (-not $FilePath) { return $null }
    if (-not (Test-Path -LiteralPath $FilePath)) { return $null }
    $text = [System.IO.File]::ReadAllText($FilePath)
    return [pscustomobject]@{
        Name        = 'legacy'
        Payload     = $text
        FullPayload = $text
    }
}

function Write-GuidReviewSections {
    param($HostName, $GuidName, $HostReview, $PageReview, $Steering)
    Write-Output ("Host review ({0})" -f $HostName)
    if ($null -eq $HostReview) {
        Write-Output 'Host not reviewed yet'
    }
    else {
        Write-Output $HostReview.text
    }
    Write-Output ''
    Write-Output ("Page review ({0})" -f $GuidName)
    if ($null -eq $PageReview) {
        Write-Output 'Page not reviewed yet'
    }
    else {
        Write-Output $PageReview.text
    }
    Write-Output ''
    Write-Output 'Steering'
    if ($null -eq $Steering) {
        Write-Output '(none)'
    }
    else {
        Write-Output $Steering.text
    }
}

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
    $metaCfg = Get-FolderMetaSearchConfig
    $profileName = Resolve-FolderMetaAwsProfile -AwsProfile $AwsProfile -Config $metaCfg
    $prevAwsProfile = [Environment]::GetEnvironmentVariable('AWS_PROFILE', 'Process')
    [Environment]::SetEnvironmentVariable('AWS_PROFILE', $profileName, 'Process')
    try {
    $target = if ($Path) { $Path } else { (Get-Location).Path }
    if (-not $Json) {
        Write-FolderToolStep ("meta starting path={0}" -f $target)
    }
    $loc = ConvertTo-FolderS3Location -Path $target -MountRoot $MountRoot
    # FR #4087: empty Key is bucket root (S:\a-clubs) — clear message, exit 5
    if ([string]::IsNullOrEmpty($loc.Key)) {
        throw ("bucket_root: s3://{0}/ is the bucket root; cd into a host/GUID/provider folder" -f $loc.Bucket)
    }
    if (-not $Json) {
        Write-FolderToolStep ("Resolved s3://{0}/{1} kind={2}" -f $loc.Bucket, $loc.Key, $loc.Kind)
    }

    # FR #5148: injectable scriptblocks cannot cross Start-Job; use sync path for tests.
    $useInject = [bool]$AwsHeadObject -or [bool]$AwsGetObjectTagging -or [bool]$AwsListAnnotations -or [bool]$AwsGetAnnotation -or [bool]$RcloneLsJson
    if ($useInject) {
        $marker = Get-FolderS3ObjectMeta -Bucket $loc.Bucket -Key $loc.Key -Backend $Backend `
            -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
            -RcloneLsJson $RcloneLsJson
    }
    else {
        $marker = Invoke-FolderToolWithSpinner -Label 'Reading folder marker metadata/tags' -ArgumentList @(
            $here, $loc.Bucket, $loc.Key, $Backend, $profileName
        ) -ScriptBlock {
            param($toolsDir, $bucket, $key, $backend, $awsProfile)
            if ($awsProfile) { $env:AWS_PROFILE = $awsProfile }
            . (Join-Path $toolsDir 'FolderS3.ps1')
            return (Get-FolderS3ObjectMeta -Bucket $bucket -Key $key -Backend $backend)
        }
    }

    # GUID reviews are always complete (FR #4270). Host folders still truncate unless -Full.
    $reviewFull = [bool]$Full -or ($loc.Kind -eq 'guid')
    if ($useInject) {
        $ann = Get-FolderS3Annotations -Bucket $loc.Bucket -Key $loc.Key -Full:$reviewFull `
            -AwsListAnnotations $AwsListAnnotations -AwsGetAnnotation $AwsGetAnnotation
    }
    else {
        $ann = Invoke-FolderToolWithSpinner -Label 'Reading object annotations' -ArgumentList @(
            $here, $loc.Bucket, $loc.Key, [bool]$reviewFull, $profileName
        ) -ScriptBlock {
            param($toolsDir, $bucket, $key, $full, $awsProfile)
            if ($awsProfile) { $env:AWS_PROFILE = $awsProfile }
            . (Join-Path $toolsDir 'FolderS3.ps1')
            return (Get-FolderS3Annotations -Bucket $bucket -Key $key -Full:$full)
        }
    }

    $hostAnn = $null
    $hostReview = $null
    $pageReview = $null
    $steeringReview = $null
    $isGuidFolder = ($loc.Kind -eq 'guid')
    if ($loc.Kind -eq 'guid' -or $loc.Kind -eq 'guid-child') {
        $hostKey = Get-FolderS3ParentHostKey -Location $loc
        if ($hostKey) {
            if ($useInject) {
                $hostAnns = Get-FolderS3Annotations -Bucket $loc.Bucket -Key ($hostKey + '/') -Full:$reviewFull `
                    -AwsListAnnotations $AwsListAnnotations -AwsGetAnnotation $AwsGetAnnotation
            }
            else {
                $hostAnns = Invoke-FolderToolWithSpinner -Label 'Reading parent host annotations' -ArgumentList @(
                    $here, $loc.Bucket, ($hostKey + '/'), [bool]$reviewFull, $profileName
                ) -ScriptBlock {
                    param($toolsDir, $bucket, $key, $full, $awsProfile)
                    if ($awsProfile) { $env:AWS_PROFILE = $awsProfile }
                    . (Join-Path $toolsDir 'FolderS3.ps1')
                    return (Get-FolderS3Annotations -Bucket $bucket -Key $key -Full:$full)
                }
            }
            $hostAnn = @($hostAnns.Items) | Where-Object { $_.Name -eq 'annotation' } | Select-Object -First 1
            if (-not $hostAnn -and @($hostAnns.Items).Count) {
                $hostAnn = @($hostAnns.Items) | Select-Object -First 1
            }
        }
    }
    if ($isGuidFolder) {
        $guidLabel = Get-FolderS3Guid -Location $loc
        $hostLabel = Get-FolderS3ParentHostKey -Location $loc
        $hostMeta = @{}
        if ($hostLabel) {
            try {
                $hostMarker = Get-FolderS3ObjectMeta -Bucket $loc.Bucket -Key ($hostLabel + '/') -Backend $Backend `
                    -AwsHeadObject $AwsHeadObject -AwsGetObjectTagging $AwsGetObjectTagging `
                    -RcloneLsJson $RcloneLsJson
                if ($hostMarker -and $hostMarker.Metadata) { $hostMeta = $hostMarker.Metadata }
            }
            catch {
                $hostMeta = @{}
            }
        }
        $namedHost = $null
        if ($hostAnn -and $hostAnn.Name -eq 'annotation') { $namedHost = $hostAnn }
        if (-not $namedHost) {
            $hostDir = Split-Path -Parent $loc.Path
            $namedHost = Read-LegacyReviewFile -FilePath (Join-Path $hostDir 'annotations.json')
        }
        $pageAnn = Get-NamedFolderAnnotation -Items $ann.Items -Name 'annotation'
        if (-not $pageAnn) {
            $pageAnn = Read-LegacyReviewFile -FilePath (Join-Path $loc.Path 'annotations.json')
        }
        $steerAnn = Get-NamedFolderAnnotation -Items $ann.Items -Name 'steering'
        if (-not $steerAnn) {
            $steerAnn = Read-LegacyReviewFile -FilePath (Join-Path $loc.Path 'steering.json')
        }
        $pageAnnotated = Get-MarkerMetaValue -Metadata $marker.Metadata -Name 'annotated'
        $pageUpdated = Get-MarkerMetaValue -Metadata $marker.Metadata -Name 'lastupdate'
        $hostAnnotated = Get-MarkerMetaValue -Metadata $hostMeta -Name 'annotated'
        $hostUpdated = Get-MarkerMetaValue -Metadata $hostMeta -Name 'lastupdate'
        $hostReview = New-FolderReviewField -Ann $namedHost -Annotated $hostAnnotated -LastUpdate $hostUpdated
        $pageReview = New-FolderReviewField -Ann $pageAnn -Annotated $pageAnnotated -LastUpdate $pageUpdated
        $steeringReview = New-FolderReviewField -Ann $steerAnn -Annotated $pageAnnotated -LastUpdate $pageUpdated
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
        if ($isGuidFolder) {
            $jsonReport.hostReview = $hostReview
            $jsonReport.pageReview = $pageReview
            $jsonReport.steering = $steeringReview
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
        if ($isGuidFolder) {
            Write-Output ''
            Write-GuidReviewSections -HostName $hostLabel -GuidName $guidLabel `
                -HostReview $hostReview -PageReview $pageReview -Steering $steeringReview
        }
    }
    exit 0
    }
    finally {
        if ($null -eq $prevAwsProfile) {
            [Environment]::SetEnvironmentVariable('AWS_PROFILE', $null, 'Process')
        }
        else {
            [Environment]::SetEnvironmentVariable('AWS_PROFILE', $prevAwsProfile, 'Process')
        }
    }
}
catch {
    $msg = $_.Exception.Message
    [Console]::Error.WriteLine($msg)

    $detailForIssue = $null
    if (Get-Variable -Name safe -Scope 0 -ErrorAction SilentlyContinue) { $detailForIssue = $safe }
    elseif (Get-Variable -Name msg -Scope 0 -ErrorAction SilentlyContinue) { $detailForIssue = $msg }
    else { $detailForIssue = $_.Exception.Message }
    $exitForIssue = 1
    if ($detailForIssue -match '^path_outside_mount') { $exitForIssue = 2 }
    elseif ($detailForIssue -match '^bucket_root') { $exitForIssue = 5 }
    $s3ForIssue = ''
    if (Get-Variable -Name loc -Scope 0 -ErrorAction SilentlyContinue) {
        if ($null -ne $loc) { $s3ForIssue = ('s3://{0}/{1}' -f $loc.Bucket, $loc.Key) }
    }
    if ($exitForIssue -notin @(2, 3, 4, 5)) {
    $cwdForIssue = ''
    if (Get-Variable -Name Path -Scope 0 -ErrorAction SilentlyContinue) { $cwdForIssue = [string]$Path }
    Invoke-ASearchToolFailureReport -Tool 'meta' -ErrorCode 'error' -Detail ([string]$detailForIssue) -ExitCode $exitForIssue -Cwd $cwdForIssue -S3Uri ([string]$s3ForIssue) -CommandLine ([string]$MyInvocation.Line)
    }
    if ($msg -match '^path_outside_mount') {
        exit 2
    }
    if ($msg -match '^bucket_root') {
        exit 5
    }
    exit 1
}
