# Folder tools (FR #4043)

PowerShell helpers for the mapped S3 drive (`D:\s3` by default, or `A_SEARCH_S3_MOUNT`).
First path segment under the mount is the bucket (`a-clubs`, `a-affiliates`, `a-merchants`).

## meta / Get-FolderMeta.ps1

Read-only view of the cwd (or `-Path`) folder marker:

1. **Metadata** on the zero-byte `{prefix}/` marker (secrets always masked as `***set***` / `(empty)`).
2. **Tags** on the marker.
3. **Annotations** via S3 object annotations (`list-object-annotations` / `get-object-annotation`) --- names such as `annotation` and `steering`. Long payloads truncate unless you pass `-Full`.
4. Folder **kind** (host, guid, provider, affiliate, merchant) from bucket + depth.
5. For a GUID folder, also the parent host's `annotation`.

```powershell
cd D:\s3\a-clubs\example.com\11111111-1111-1111-1111-111111111111
..\..\..\..\path\to\repo\tools\meta.ps1
# or
.\tools\Get-FolderMeta.ps1 -Path 'D:\s3\a-clubs\example.com' -Json
.\tools\Get-FolderMeta.ps1 -Path 'D:\s3\a-affiliates\awin\partner-1' -Full
```

Outside the mount root exits `2` with `path_outside_mount: ...`. Bucket root (e.g. `S:\a-clubs`) exits `5` with `bucket_root: ...` (FR #4087). Drive-letter mounts `S:\` / `S:` stay `S:\` (do not trim to `S:`).

Backends: `aws` (redqueen: `head-object` + `get-object-tagging` + annotation APIs) or `rclone` (walrus metadata). Annotations need the AWS CLI annotation APIs (rclone / File Gateway do not support them).

## search / Invoke-FolderSearch.ps1

POST `/search` (#4030) for an `a-clubs` host/GUID folder. Reads `metadata.host` (not the path hostkey) and GUID, loads `searches.json`, SigV4-signs with the redqueen agents profile. Never writes S3. Never prints credentials.

```powershell
# GUID folder
.\tools\search.ps1 -Path 'D:\s3\a-clubs\example.com\11111111-1111-1111-1111-111111111111' `
  -SearchApiUrl 'https://EXAMPLE.execute-api.eu-west-2.amazonaws.com'

# Host folder: require -All (one POST per GUID child)
.\tools\search.ps1 -Path 'D:\s3\a-clubs\example.com' -All
```

Config (optional): copy `folder-tools.config.example.json` to `tools/folder-tools.config.json`
or `%ProgramData%\a-search\folder-tools.config.json`, or set:

- `A_SEARCH_SEARCH_API_URL`
- `A_SEARCH_AGENT_API_KEY` (or name in config `AgentApiKeyEnv`)
- `A_SEARCH_AGENTS_AWS_PROFILE` (default `a-search-redqueen-agents`)
- `A_SEARCH_S3_MOUNT` / `A_SEARCH_FOLDER_TOOLS_CONFIG`

Exit codes: `2` outside mount, `3` not a-clubs host/GUID, `4` host folder without `-All`. `Get-FolderMeta` also uses `5` for bucket root (FR #4087).

## download / Invoke-FolderDownload.ps1

Manual affiliate parts download for `a-affiliates` (FR #4108). Reuses `affiliates/src/downloadOne` via `tools/run-folder-download.js` (no second fetch implementation; not the #4001 DB import).

From an affiliate folder, reads marker metadata (`feedurl`, format/compression) and writes `{provider}/{affiliateid}/parts/{yyyy-mm-dd}.{ext}` + `parts/latest.{ext}`, bumping `lastdownload` / `laststatus` / `lastsize` / `lastmod`. Default **skips** when today's dated parts object already exists (`parts_exists`); pass `-Force` to re-download. Provider cwd requires `-All` (per-affiliate; one failure does not stop the others).

```powershell
cd S:\a-affiliates\awin\<affiliateid>
download          # or: .\tools\download.ps1
download -WhatIf  # dry run: no HTTP, no S3 writes; feedurl shown as ***set***
download -Force   # overwrite today's dated parts
cd S:\a-affiliates\awin
download -All     # each affiliate child
```

Env: `A_SEARCH_S3_MOUNT`, `A_SEARCH_AGENTS_AWS_PROFILE` / `AWS_PROFILE` (default `a-search-redqueen-agents`), `A_AFFILIATES_BUCKET` (default `a-affiliates`). Never prints feed URLs, passwords, or tokens.

Exit codes: `2` outside mount, `3` not an `a-affiliates` provider/affiliate folder, `4` provider without `-All`, `5` bucket root, `1` download/missing_feedurl/partial `-All` failure, `0` success (including `parts_exists` skip).

## Tests

```powershell
Invoke-Pester .\tests\fr4043-folder-tools.Tests.ps1
Invoke-Pester .\tests\fr4108-folder-download.Tests.ps1
node --test tests/fr4108-folder-download.test.js
```

Mocks cover mapping, secret masking, empty annotations, `-Json`, outside-mount exit 2, GUID/host search, download cwd/dry-run/secrets, and no credentials in output.
