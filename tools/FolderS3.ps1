# FR #4043: map a mapped-S3 cwd (or -Path) to bucket/key and classify folder kind.
# Dot-source from Get-FolderMeta.ps1 / Invoke-FolderSearch.ps1. Read-only helpers only.

Set-StrictMode -Version Latest

$script:FolderS3DefaultMountRoot = 'D:\s3'
$script:FolderS3AnnotationPreviewChars = 2048

function Get-FolderS3MountRoot {
    param([string]$MountRoot)
    if ($MountRoot -and $MountRoot.Trim()) { return $MountRoot.TrimEnd('\', '/') }
    if ($env:A_SEARCH_S3_MOUNT -and $env:A_SEARCH_S3_MOUNT.Trim()) {
        return $env:A_SEARCH_S3_MOUNT.TrimEnd('\', '/')
    }
    return $script:FolderS3DefaultMountRoot
}

function ConvertTo-FolderS3Location {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string]$MountRoot
    )
    $root = Get-FolderS3MountRoot -MountRoot $MountRoot
    $full = [System.IO.Path]::GetFullPath($Path)
    $rootFull = [System.IO.Path]::GetFullPath($root)
    if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw ("path_outside_mount: '{0}' is not under mount root '{1}'" -f $full, $rootFull)
    }
    $rel = $full.Substring($rootFull.Length).TrimStart('\', '/')
    if (-not $rel) {
        throw 'path_outside_mount: path is the mount root itself; need bucket/...'
    }
    $parts = @($rel -split '[\\/]+' | Where-Object { $_ -ne '' })
    if ($parts.Count -lt 1) {
        throw 'path_outside_mount: no bucket segment under mount'
    }
    $bucket = $parts[0]
    $keyParts = @()
    if ($parts.Count -gt 1) { $keyParts = @($parts[1..($parts.Count - 1)]) }
    $key = if ($keyParts.Count) { (($keyParts -join '/') + '/') } else { '' }
    $kind = Resolve-FolderS3Kind -Bucket $bucket -KeyParts $keyParts
    [pscustomobject]@{
        MountRoot = $rootFull
        Path      = $full
        Bucket    = $bucket
        Key       = $key
        KeyParts  = @($keyParts)
        Kind      = $kind
    }
}

function Resolve-FolderS3Kind {
    param(
        [Parameter(Mandatory = $true)][string]$Bucket,
        [string[]]$KeyParts
    )
    $b = $Bucket.ToLowerInvariant()
    $n = @($KeyParts).Count
    switch ($b) {
        'a-clubs' {
            if ($n -eq 1) { return 'host' }
            if ($n -eq 2) { return 'guid' }
            if ($n -ge 3) { return 'guid-child' }
            return 'a-clubs-root'
        }
        'a-affiliates' {
            if ($n -eq 1) { return 'provider' }
            if ($n -eq 2) { return 'affiliate' }
            if ($n -ge 3) { return 'affiliate-child' }
            return 'a-affiliates-root'
        }
        'a-merchants' {
            if ($n -eq 1) { return 'provider' }
            if ($n -eq 2) { return 'merchant' }
            if ($n -ge 3) { return 'merchant-child' }
            return 'a-merchants-root'
        }
        default { return 'unknown' }
    }
}

function Test-FolderS3SecretKeyName {
    param([Parameter(Mandatory = $true)][string]$Name)
    $n = $Name.ToLowerInvariant()
    $exact = @(
        'passwordhash', 'password', 'apitoken', 'apikey', 'apisecret',
        'accesstoken', 'stripewhsec'
    )
    if ($exact -contains $n) { return $true }
    if ($n -eq 'hostkey' -or $n -eq 'userid') { return $false }
    if ($n.EndsWith('id') -and $n -notmatch 'secret|token|password|key') { return $false }
    if ($n -match 'secret|token|password') { return $true }
    if ($n -match 'key' -and $n -ne 'hostkey') { return $true }
    return $false
}

function Mask-FolderS3MetadataValue {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        $Value
    )
    if (Test-FolderS3SecretKeyName -Name $Name) {
        if ($null -eq $Value -or [string]::IsNullOrEmpty([string]$Value)) {
            return '(empty)'
        }
        return '***set***'
    }
    if ($null -eq $Value) { return '' }
    return [string]$Value
}

function Convert-FolderS3MetadataForDisplay {
    param([hashtable]$Metadata)
    $out = [ordered]@{}
    if (-not $Metadata) { return $out }
    foreach ($k in ($Metadata.Keys | Sort-Object)) {
        $out[$k] = Mask-FolderS3MetadataValue -Name $k -Value $Metadata[$k]
    }
    return $out
}

function Convert-FolderS3MetadataForJson {
    param([hashtable]$Metadata)
    $out = [ordered]@{}
    if (-not $Metadata) { return $out }
    foreach ($k in ($Metadata.Keys | Sort-Object)) {
        $n = [string]$k
        $v = $Metadata[$k]
        if (Test-FolderS3SecretKeyName -Name $n) {
            $out[$n] = @{
                masked = $true
                set    = -not [string]::IsNullOrEmpty([string]$v)
            }
        }
        elseif ($n.ToLowerInvariant() -eq 'email') {
            $out[$n] = @{
                pii   = $true
                value = if ($null -eq $v) { '' } else { [string]$v }
            }
        }
        else {
            $out[$n] = if ($null -eq $v) { '' } else { [string]$v }
        }
    }
    return $out
}

function Get-FolderS3ObjectMeta {
    param(
        [Parameter(Mandatory = $true)][string]$Bucket,
        [Parameter(Mandatory = $true)][string]$Key,
        [scriptblock]$AwsHeadObject,
        [scriptblock]$AwsGetObjectTagging,
        [scriptblock]$RcloneLsJson,
        [ValidateSet('auto', 'aws', 'rclone')][string]$Backend = 'auto'
    )
    $useAws = $Backend -eq 'aws'
    $useRclone = $Backend -eq 'rclone'
    if ($Backend -eq 'auto') {
        if ($AwsHeadObject) { $useAws = $true }
        elseif ($RcloneLsJson) { $useRclone = $true }
        elseif (Get-Command aws -ErrorAction SilentlyContinue) { $useAws = $true }
        elseif (Get-Command rclone -ErrorAction SilentlyContinue) { $useRclone = $true }
        else { throw 'no_backend: neither aws nor rclone available' }
    }

    $metadata = @{}
    $tags = @{}

    if ($useAws) {
        $headFn = $AwsHeadObject
        if (-not $headFn) {
            $headFn = {
                param($b, $k)
                aws s3api head-object --bucket $b --key $k --output json 2>$null
            }
        }
        $tagFn = $AwsGetObjectTagging
        if (-not $tagFn) {
            $tagFn = {
                param($b, $k)
                aws s3api get-object-tagging --bucket $b --key $k --output json 2>$null
            }
        }
        $headRaw = & $headFn $Bucket $Key
        if (-not $headRaw) { throw ("head_failed: s3://{0}/{1}" -f $Bucket, $Key) }
        $head = if ($headRaw -is [string]) { $headRaw | ConvertFrom-Json } else { $headRaw }
        if ($head.Metadata) {
            foreach ($p in $head.Metadata.PSObject.Properties) {
                $metadata[$p.Name] = [string]$p.Value
            }
        }
        $tagRaw = & $tagFn $Bucket $Key
        if ($tagRaw) {
            $tagDoc = if ($tagRaw -is [string]) { $tagRaw | ConvertFrom-Json } else { $tagRaw }
            foreach ($t in @($tagDoc.TagSet)) {
                if ($t -and $t.Key) { $tags[[string]$t.Key] = [string]$t.Value }
            }
        }
    }
    elseif ($useRclone) {
        $rcFn = $RcloneLsJson
        if (-not $rcFn) {
            $rcFn = {
                param($b, $k)
                $remote = if ($env:A_SEARCH_RCLONE_REMOTE) { $env:A_SEARCH_RCLONE_REMOTE } else { 's3' }
                rclone lsjson --metadata ("{0}:{1}/{2}" -f $remote, $b, $k.TrimEnd('/')) 2>$null
            }
        }
        $raw = & $rcFn $Bucket $Key
        if (-not $raw) { throw ("rclone_failed: s3://{0}/{1}" -f $Bucket, $Key) }
        $arr = if ($raw -is [string]) { $raw | ConvertFrom-Json } else { $raw }
        $item = @($arr) | Select-Object -First 1
        if (-not $item) { throw ("rclone_empty: s3://{0}/{1}" -f $Bucket, $Key) }
        if ($item.Metadata) {
            foreach ($p in $item.Metadata.PSObject.Properties) {
                $metadata[$p.Name] = [string]$p.Value
            }
        }
    }
    else {
        throw 'no_backend: neither aws nor rclone available'
    }

    $backendName = 'rclone'
    if ($useAws) { $backendName = 'aws' }
    [pscustomobject]@{
        Bucket   = $Bucket
        Key      = $Key
        Metadata = $metadata
        Tags     = $tags
        Backend  = $backendName
    }
}

function Get-FolderS3TextObject {
    param(
        [Parameter(Mandatory = $true)][string]$Bucket,
        [Parameter(Mandatory = $true)][string]$Key,
        [scriptblock]$AwsGetObject,
        [scriptblock]$RcloneCat,
        [ValidateSet('auto', 'aws', 'rclone')][string]$Backend = 'auto'
    )
    $useAws = $Backend -eq 'aws'
    $useRclone = $Backend -eq 'rclone'
    if ($Backend -eq 'auto') {
        if ($AwsGetObject) { $useAws = $true }
        elseif ($RcloneCat) { $useRclone = $true }
        elseif (Get-Command aws -ErrorAction SilentlyContinue) { $useAws = $true }
        elseif (Get-Command rclone -ErrorAction SilentlyContinue) { $useRclone = $true }
        else { return $null }
    }
    try {
        if ($useAws) {
            $fn = $AwsGetObject
            if (-not $fn) {
                $fn = {
                    param($b, $k)
                    $tmp = [System.IO.Path]::GetTempFileName()
                    try {
                        aws s3api get-object --bucket $b --key $k $tmp 2>$null | Out-Null
                        if (Test-Path -LiteralPath $tmp) {
                            return [System.IO.File]::ReadAllText($tmp)
                        }
                        return $null
                    }
                    finally {
                        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
                    }
                }
            }
            return & $fn $Bucket $Key
        }
        if ($useRclone) {
            $fn = $RcloneCat
            if (-not $fn) {
                $fn = {
                    param($b, $k)
                    $remote = if ($env:A_SEARCH_RCLONE_REMOTE) { $env:A_SEARCH_RCLONE_REMOTE } else { 's3' }
                    rclone cat ("{0}:{1}/{2}" -f $remote, $b, $k) 2>$null
                }
            }
            return & $fn $Bucket $Key
        }
    }
    catch {
        return $null
    }
    return $null
}

function Get-FolderS3Annotations {
    <#
    .SYNOPSIS
    List + get S3 object annotations on a folder marker (FR #4043 / #3987).
    Uses aws s3api list-object-annotations + get-object-annotation.
    rclone / File Gateway has no annotation API; pass injectables in tests.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Bucket,
        [Parameter(Mandatory = $true)][string]$Key,
        [scriptblock]$AwsListAnnotations,
        [scriptblock]$AwsGetAnnotation,
        [switch]$Full,
        [int]$PreviewChars = 0
    )
    if ($PreviewChars -le 0) { $PreviewChars = $script:FolderS3AnnotationPreviewChars }

    $listFn = $AwsListAnnotations
    if (-not $listFn) {
        $listFn = {
            param($b, $k)
            aws s3api list-object-annotations --bucket $b --key $k --output json 2>$null
        }
    }
    $getFn = $AwsGetAnnotation
    if (-not $getFn) {
        $getFn = {
            param($b, $k, $name)
            $tmp = [System.IO.Path]::GetTempFileName()
            try {
                aws s3api get-object-annotation --bucket $b --key $k --annotation-name $name $tmp 2>$null | Out-Null
                if (Test-Path -LiteralPath $tmp) {
                    return [System.IO.File]::ReadAllText($tmp)
                }
                return $null
            }
            finally {
                Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
            }
        }
    }

    $listRaw = $null
    try { $listRaw = & $listFn $Bucket $Key } catch { $listRaw = $null }
    if (-not $listRaw) {
        return [pscustomobject]@{
            Items   = @()
            Present = $false
            Error   = $null
        }
    }

    $listDoc = if ($listRaw -is [string]) { $listRaw | ConvertFrom-Json } else { $listRaw }
    $names = @()
    foreach ($a in @($listDoc.Annotations)) {
        if ($a -and $a.AnnotationName) { $names += [string]$a.AnnotationName }
    }

    $items = @()
    foreach ($name in $names) {
        $payload = $null
        try { $payload = & $getFn $Bucket $Key $name } catch { $payload = $null }
        $text = if ($null -eq $payload) { '' } else { [string]$payload }
        $truncated = (-not $Full) -and ($text.Length -gt $PreviewChars)
        $shown = $text
        if ($truncated) {
            $shown = $text.Substring(0, $PreviewChars) + "`n... [truncated; pass -Full for complete payload]"
        }
        $metaSize = $null
        $hit = @($listDoc.Annotations) | Where-Object { $_.AnnotationName -eq $name } | Select-Object -First 1
        if ($hit -and $hit.PSObject.Properties['Size']) { $metaSize = [long]$hit.Size }
        $sizeVal = [long]$text.Length
        if ($null -ne $metaSize) { $sizeVal = $metaSize }
        $items += [pscustomobject]@{
            Name        = $name
            Size        = $sizeVal
            Truncated   = [bool]$truncated
            Payload     = $shown
            FullPayload = $text
        }
    }

    [pscustomobject]@{
        Items   = $items
        Present = $items.Count -gt 0
        Error   = $null
    }
}

function Get-FolderS3ParentHostKey {
    param([Parameter(Mandatory = $true)]$Location)
    if ($Location.Kind -ne 'guid' -and $Location.Kind -ne 'guid-child') { return $null }
    if ($Location.KeyParts.Count -lt 1) { return $null }
    return [string]$Location.KeyParts[0]
}

function Get-FolderS3Guid {
    param([Parameter(Mandatory = $true)]$Location)
    if ($Location.Kind -ne 'guid' -and $Location.Kind -ne 'guid-child') { return $null }
    if ($Location.KeyParts.Count -lt 2) { return $null }
    return [string]$Location.KeyParts[1]
}
