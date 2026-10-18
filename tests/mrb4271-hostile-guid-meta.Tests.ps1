# docs/mrb-4271 hostile: object annotation wins over a legacy sidecar.
# Pester 3.4 / WinPS 5.1
$ErrorActionPreference = 'Stop'
$tools = Join-Path (Split-Path $PSScriptRoot -Parent) 'tools'
$scriptPath = Join-Path $tools 'Get-FolderMeta.ps1'

Describe 'MRB #4271 hostile GUID meta' {
    It 'object annotation is used when annotations.json is also on the mount' {
        $mount = Join-Path $env:TEMP 'mrb4271-meta-mount'
        if (Test-Path $mount) { Remove-Item -LiteralPath $mount -Recurse -Force -ErrorAction SilentlyContinue }
        $guidDir = Join-Path $mount 'a-clubs\host1\guid1'
        $hostDir = Join-Path $mount 'a-clubs\host1'
        New-Item -ItemType Directory -Force -Path $guidDir | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $hostDir 'annotations.json'), 'LEGACY-HOST')
        [System.IO.File]::WriteAllText((Join-Path $guidDir 'annotations.json'), 'LEGACY-PAGE')
        $head = {
            param($b, $k)
            if ($k -eq 'host1/') { return '{"Metadata":{"annotated":"1","lastupdate":"h"},"ContentLength":0}' }
            return '{"Metadata":{"annotated":"1","lastupdate":"p"},"ContentLength":0}'
        }
        $tags = { param($b, $k) '{"TagSet":[]}' }
        $listAnn = { param($b, $k) '{"Annotations":[{"AnnotationName":"annotation","Size":11}]}' }
        $getAnn = {
            param($b, $k, $n)
            if ($k -eq 'host1/') { return 'OBJECT-HOST' }
            return 'OBJECT-PAGE'
        }
        $json = & $scriptPath -Path $guidDir -MountRoot $mount -Json -Backend aws `
            -AwsHeadObject $head -AwsGetObjectTagging $tags `
            -AwsListAnnotations $listAnn -AwsGetAnnotation $getAnn 2>&1 | Out-String
        $LASTEXITCODE | Should Be 0
        $doc = $json | ConvertFrom-Json
        $doc.hostReview.text | Should Be 'OBJECT-HOST'
        $doc.pageReview.text | Should Be 'OBJECT-PAGE'
        $json | Should Not Match 'LEGACY-HOST'
        $json | Should Not Match 'LEGACY-PAGE'
    }
}
