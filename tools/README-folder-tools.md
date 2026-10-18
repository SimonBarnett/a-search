# Folder tools (FR #4043)

PowerShell helpers for the mapped S3 drive (`D:\s3` by default, or `A_SEARCH_S3_MOUNT`).
First path segment under the mount is the bucket (`a-clubs`, `a-affiliates`, `a-merchants`).

## meta / Get-FolderMeta.ps1

Read-only view of the cwd (or `-Path`) folder marker:

1. **Metadata** on the zero-byte `{prefix}/` marker (secrets always masked as `***set***` / `(empty)`).
2. **Tags** on the marker.
3. **Annotations** via S3 object annotations (`list-object-annotations` / `get-object-annotation`) --- names such as `annotation` and `steering`. Long payloads truncate unless you pass `-Full`.
4. Folder **kind** (host, guid, provider, affiliate, merchant) from bucket + depth.
5. For a GUID folder, three labelled sections in order: `Host review ({host})`, `Page review ({guid})`, `Steering`. Each is the full object-annotation text (never the 2048-character preview). `-Json` adds `hostReview`, `pageReview` and `steering`, each with that marker's `annotated` and `lastupdate`. A missing review is null and the text view says `Host not reviewed yet` or `Page not reviewed yet` (exit 0). Legacy `annotations.json` / `steering.json` are read only when the object annotation is absent and the file is on the mount. A host folder stays the metadata / tags / annotations view.

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

Manual affiliate feed download for `a-affiliates` (FR #4108 / #4195). Reuses `affiliates/src/downloadOne` via `tools/run-folder-download.js` (no second fetch implementation; not the #4001 DB import).

From an affiliate folder, reads marker metadata (`feedurl`, format/compression) and writes one decompressed object `{provider}/{affiliateid}/{yyyy-mm-dd}.{ext}` (no `parts/`, no `latest`), bumping `lastdownload` / `lastok` / `laststatus` / `lastsize` / `lastmod`. Default **skips** when today's dated object already exists (`exists`); pass `-Force` to re-download. Provider cwd requires `-All` (per-affiliate; one failure does not stop the others). Summary lines include `key=`.

```powershell
cd S:\a-affiliates\awin\<affiliateid>
download          # or: .\tools\download.ps1
download -WhatIf  # dry run: no HTTP, no S3 writes; feedurl shown as ***set***
download -Force   # overwrite today's dated feed
cd S:\a-affiliates\awin
download -All     # each affiliate child
```

Env: `A_SEARCH_S3_MOUNT` (redqueen: `S:\`; default falls back to `D:\s3`), `A_SEARCH_AGENTS_AWS_PROFILE` / `AWS_PROFILE` (default `a-search-redqueen-agents`), `A_AFFILIATES_BUCKET` (default `a-affiliates`). Never prints feed URLs, passwords, or tokens.

**AWS identity (FR #4167):** `Invoke-FolderDownload` resolves one profile (`-AwsProfile`, else `A_SEARCH_AGENTS_AWS_PROFILE`, else `AWS_PROFILE`, else `a-search-redqueen-agents`) and sets process `AWS_PROFILE` for the whole run so marker metadata reads (`aws s3api head-object` / tagging) and Node S3 writes use the same identity. Setting `A_SEARCH_AGENTS_AWS_PROFILE` alone is enough.

**WinPS 5.1 (FR #4167):** JSON args (including `affiliateMeta` / `feedurl`) are passed to Node via process env `A_SEARCH_FOLDER_DOWNLOAD_ARGS` and `run-folder-download.js --args-env`, not on the process command line (avoids 5.1 quote mangling and keeps the feed key out of Task Manager / process audit). Shims `download.ps1` / `meta.ps1` / `search.ps1` end with `exit $LASTEXITCODE` so `powershell -File` preserves tool exit codes.

Exit codes: `2` outside mount, `3` not an `a-affiliates` provider/affiliate folder, `4` provider without `-All`, `5` bucket root, `1` download/missing_feedurl/partial `-All` failure, `0` success (including `exists` skip).

## Tests

```powershell
Invoke-Pester .\tests\fr4043-folder-tools.Tests.ps1
Invoke-Pester .\tests\fr4108-folder-download.Tests.ps1
Invoke-Pester .\tests\fr4167-folder-download-winps.Tests.ps1
node --test tests/fr4108-folder-download.test.js
node --test tests/fr4167-folder-download-winps.test.js
```

Mocks cover mapping, secret masking, empty annotations, `-Json`, outside-mount exit 2, GUID/host search, download cwd/dry-run/secrets, no credentials in output, WinPS args-env handoff, shim exit codes, and unified AWS profile.
