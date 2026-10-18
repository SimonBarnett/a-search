# FR #4270 --- meta on a GUID folder returns the full host review and the page review.
# Pester 3.4 / WinPS 5.1
$ErrorActionPreference = 'Stop'
$tools = Join-Path (Split-Path $PSScriptRoot -Parent) 'tools'
$scriptPath = Join-Path $tools 'Get-FolderMeta.ps1'

function New-Fr4270Mount {
    $mount = Join-Path $env:TEMP 'fr4270-meta-mount'
    if (Test-Path $mount) { Remove-Item -LiteralPath $mount -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Force -Path (Join-Path $mount 'a-clubs\host1\guid1') | Out-Null
    return $mount
}

Describe 'FR #4270 GUID meta reviews' {
    It 'GUID folder returns both reviews in full, in order, and as JSON fields' {
        $mount = New-Fr4270Mount
        $hostText = ('H' * 2500) + 'HOST-FULL-END'
        $pageText = ('P' * 2500) + 'PAGE-FULL-END'
        $steerText = 'STEER-FULL'
        $head = {
            param($b, $k)
            if ($k -eq 'host1/') {
                return '{"Metadata":{"annotated":"1","lastupdate":"2026-10-01T00:00:00Z","host":"Example"},"ContentLength":0}'
            }
            return '{"Metadata":{"annotated":"1","lastupdate":"2026-10-02T00:00:00Z","uri":"/p"},"ContentLength":0}'
        }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $listAnn = {
            param($b, $k)
            if ($k -eq 'host1/') {
                return '{"Annotations":[{"AnnotationName":"annotation","Size":2500}]}'
            }
            return '{"Annotations":[{"AnnotationName":"annotation","Size":2500},{"AnnotationName":"steering","Size":10}]}'
        }
        $getAnn = {
            param($b, $k, $n)
            if ($k -eq 'host1/' -and $n -eq 'annotation') { return $hostText }
            if ($n -eq 'annotation') { return $pageText }
            if ($n -eq 'steering') { return $steerText }
            return $null
        }.GetNewClosure()
        $common = @{
            Path                = (Join-Path $mount 'a-clubs\host1\guid1')
            MountRoot           = $mount
            Backend             = 'aws'
            AwsHeadObject       = $head
            AwsGetObjectTagging = $tags
            AwsListAnnotations  = $listAnn
            AwsGetAnnotation    = $getAnn
        }
        $human = & $scriptPath @common 2>&1 | Out-String
        $LASTEXITCODE | Should Be 0
        $human.IndexOf('Host review (host1)') | Should BeGreaterThan -1
        $human.IndexOf('Page review (guid1)') | Should BeGreaterThan $human.IndexOf('Host review (host1)')
        $human.IndexOf("Steering") | Should BeGreaterThan $human.IndexOf('Page review (guid1)')
        $human | Should Match 'HOST-FULL-END'
        $human | Should Match 'PAGE-FULL-END'
        $human | Should Match 'STEER-FULL'
        $human | Should Not Match '\[truncated'

        $json = & $scriptPath @common -Json 2>&1 | Out-String
        $LASTEXITCODE | Should Be 0
        $doc = $json | ConvertFrom-Json
        $doc.hostReview.text | Should Match 'HOST-FULL-END'
        $doc.hostReview.annotated | Should Be '1'
        $doc.hostReview.lastupdate | Should Be '2026-10-01T00:00:00Z'
        $doc.pageReview.text | Should Match 'PAGE-FULL-END'
        $doc.pageReview.annotated | Should Be '1'
        $doc.pageReview.lastupdate | Should Be '2026-10-02T00:00:00Z'
        $doc.steering.text | Should Be 'STEER-FULL'
        $doc.steering.annotated | Should Be '1'
        $doc.steering.lastupdate | Should Be '2026-10-02T00:00:00Z'
        ($doc.hostReview.text.Length -gt 2048) | Should Be $true
        ($doc.pageReview.text.Length -gt 2048) | Should Be $true
    }

    It 'GUID whose host is not reviewed gives hostReview null and a message' {
        $mount = New-Fr4270Mount
        $head = {
            param($b, $k)
            if ($k -eq 'host1/') {
                return '{"Metadata":{"host":"Example"},"ContentLength":0}'
            }
            return '{"Metadata":{"annotated":"1","lastupdate":"2026-10-02T00:00:00Z"},"ContentLength":0}'
        }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $listAnn = {
            param($b, $k)
            if ($k -eq 'host1/') { return '{"Annotations":[]}' }
            return '{"Annotations":[{"AnnotationName":"annotation","Size":4}]}'
        }
        $getAnn = {
            param($b, $k, $n)
            if ($n -eq 'annotation' -and $k -ne 'host1/') { return 'page' }
            return $null
        }
        $human = & $scriptPath -Path (Join-Path $mount 'a-clubs\host1\guid1') -MountRoot $mount -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags `
            -AwsListAnnotations $listAnn -AwsGetAnnotation $getAnn 2>&1 | Out-String
        $LASTEXITCODE | Should Be 0
        $human | Should Match 'Host not reviewed yet'
        $json = & $scriptPath -Path (Join-Path $mount 'a-clubs\host1\guid1') -MountRoot $mount -Json -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags `
            -AwsListAnnotations $listAnn -AwsGetAnnotation $getAnn 2>&1 | Out-String
        $doc = $json | ConvertFrom-Json
        $null -eq $doc.hostReview | Should Be $true
        $doc.pageReview.text | Should Be 'page'
    }

    It 'GUID that is not reviewed gives pageReview null' {
        $mount = New-Fr4270Mount
        $head = {
            param($b, $k)
            if ($k -eq 'host1/') {
                return '{"Metadata":{"annotated":"1","lastupdate":"2026-10-01T00:00:00Z"},"ContentLength":0}'
            }
            return '{"Metadata":{"uri":"/p"},"ContentLength":0}'
        }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $listAnn = {
            param($b, $k)
            if ($k -eq 'host1/') {
                return '{"Annotations":[{"AnnotationName":"annotation","Size":4}]}'
            }
            return '{"Annotations":[]}'
        }
        $getAnn = {
            param($b, $k, $n)
            if ($k -eq 'host1/' -and $n -eq 'annotation') { return 'host' }
            return $null
        }
        $json = & $scriptPath -Path (Join-Path $mount 'a-clubs\host1\guid1') -MountRoot $mount -Json -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags `
            -AwsListAnnotations $listAnn -AwsGetAnnotation $getAnn 2>&1 | Out-String
        $LASTEXITCODE | Should Be 0
        $doc = $json | ConvertFrom-Json
        $null -eq $doc.pageReview | Should Be $true
        $doc.hostReview.text | Should Be 'host'
        $human = & $scriptPath -Path (Join-Path $mount 'a-clubs\host1\guid1') -MountRoot $mount -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags `
            -AwsListAnnotations $listAnn -AwsGetAnnotation $getAnn 2>&1 | Out-String
        $human | Should Match 'Page not reviewed yet'
    }

    It 'host folder stays the current meta view' {
        $mount = New-Fr4270Mount
        $head = { param($b, $k) '{"Metadata":{"host":"Example"},"ContentLength":0}' }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $listAnn = { param($b, $k) '{"Annotations":[{"AnnotationName":"annotation","Size":4}]}' }
        $getAnn = { param($b, $k, $n) 'host-only' }
        $human = & $scriptPath -Path (Join-Path $mount 'a-clubs\host1') -MountRoot $mount -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags `
            -AwsListAnnotations $listAnn -AwsGetAnnotation $getAnn 2>&1 | Out-String
        $LASTEXITCODE | Should Be 0
        $human | Should Match '--- metadata ---'
        $human | Should Match '--- annotations ---'
        $human | Should Not Match 'Page review'
        $json = & $scriptPath -Path (Join-Path $mount 'a-clubs\host1') -MountRoot $mount -Json -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags `
            -AwsListAnnotations $listAnn -AwsGetAnnotation $getAnn 2>&1 | Out-String
        $doc = $json | ConvertFrom-Json
        ($doc.PSObject.Properties.Name -contains 'pageReview') | Should Be $false
        ($doc.annotations | Where-Object { $_.Name -eq 'annotation' }).Payload | Should Be 'host-only'
    }

    It 'falls back to annotations.json only when the object annotation is missing' {
        $mount = New-Fr4270Mount
        $guidDir = Join-Path $mount 'a-clubs\host1\guid1'
        $hostDir = Join-Path $mount 'a-clubs\host1'
        [System.IO.File]::WriteAllText((Join-Path $hostDir 'annotations.json'), 'LEGACY-HOST')
        [System.IO.File]::WriteAllText((Join-Path $guidDir 'annotations.json'), 'LEGACY-PAGE')
        [System.IO.File]::WriteAllText((Join-Path $guidDir 'steering.json'), 'LEGACY-STEER')
        $head = {
            param($b, $k)
            if ($k -eq 'host1/') { return '{"Metadata":{"annotated":"1","lastupdate":"h"},"ContentLength":0}' }
            return '{"Metadata":{"annotated":"1","lastupdate":"p"},"ContentLength":0}'
        }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $listAnn = { param($b, $k) '{"Annotations":[]}' }
        $getAnn = { param($b, $k, $n) $null }
        $json = & $scriptPath -Path $guidDir -MountRoot $mount -Json -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags `
            -AwsListAnnotations $listAnn -AwsGetAnnotation $getAnn 2>&1 | Out-String
        $LASTEXITCODE | Should Be 0
        $doc = $json | ConvertFrom-Json
        $doc.hostReview.text | Should Be 'LEGACY-HOST'
        $doc.pageReview.text | Should Be 'LEGACY-PAGE'
        $doc.steering.text | Should Be 'LEGACY-STEER'
    }

    It 'masking still hides secret metadata on a GUID folder' {
        $mount = New-Fr4270Mount
        $head = {
            param($b, $k)
            if ($k -eq 'host1/') {
                return '{"Metadata":{"annotated":"1","lastupdate":"2026-10-01T00:00:00Z"},"ContentLength":0}'
            }
            return '{"Metadata":{"passwordhash":"SECRET","annotated":"1","lastupdate":"2026-10-02T00:00:00Z"},"ContentLength":0}'
        }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $listAnn = {
            param($b, $k)
            '{"Annotations":[{"AnnotationName":"annotation","Size":4}]}'
        }
        $getAnn = { param($b, $k, $n) 'review' }
        $json = & $scriptPath -Path (Join-Path $mount 'a-clubs\host1\guid1') -MountRoot $mount -Json -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags `
            -AwsListAnnotations $listAnn -AwsGetAnnotation $getAnn 2>&1 | Out-String
        $LASTEXITCODE | Should Be 0
        $json | Should Not Match 'SECRET'
        $doc = $json | ConvertFrom-Json
        $doc.metadata.passwordhash.masked | Should Be $true
    }
}
