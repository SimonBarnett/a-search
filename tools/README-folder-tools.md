# Folder tools (FR #4043)

PowerShell helpers for the mapped S3 drive (`D:\s3` by default, or `A_SEARCH_S3_MOUNT`).
First path segment under the mount is the bucket (`a-clubs`, `a-affiliates`, `a-merchants`).

## meta / Get-FolderMeta.ps1

Progress (`[HH:mm:ss] …` + `/|\|` spinner while waiting on S3) goes to **stderr**; the human/JSON report goes to **stdout**.

Read-only view of the cwd (or `-Path`) folder marker:

1. **Metadata** on the zero-byte `{prefix}/` marker (secrets always masked as `***set***` / `(empty)`).
2. **Tags** on the marker.
3. **Annotations** via S3 object annotations (`list-object-annotations` / `get-object-annotation`) --- names such as `annotation` and `steering`. Long payloads truncate unless you pass `-Full`.
4. Folder **kind** (host, guid, provider, affiliate, merchant) from bucket + depth.
   An `a-clubs` host marker identity is metadata `userid` only (FR #4287). The `{env}/x/{customerNumber}/` widget tree is unchanged.
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

POST `/search` (#4030) for an `a-clubs` host/GUID folder. Reads `metadata.host` (not the path hostkey) and GUID, loads `searches.json`, SigV4-signs via curl --aws-sigv4 using credentials from `aws configure export-credentials --profile <p> --format process` (AccessKeyId/SecretAccessKey; x-amz-security-token when a session token is present). Never pass the profile name as --user (FR #5078). Never writes S3. Never prints credentials. Deploy smoke (scripts/smoke-deploy.js) already signs via awsExecuteApiSigV4.js.

**FR #5145 --- command config + PATH install**

`search` reads `AwsProfile` and `SearchApiUrl` from `search.config.json` next to the command (shipped under `tools/`; installed copy under `C:\ai\tools` on redqueen). Flags override the config. A missing config or missing value fails with `search_config_missing` / `search_api_url_required` / `aws_profile_required` --- there is no hard-coded fallback URL or profile. The config holds no secrets.

Shipped redqueen values (also in `tools/search.config.example.json` as a template with an EXAMPLE URL):

- `AwsProfile`: `a-search-redqueen-annotator`
- `SearchApiUrl`: `https://axy0jgpkee.execute-api.eu-west-2.amazonaws.com`

Install / update from the deploy checkout (no nssm; keeps an existing config unless `-ForceConfig`):

```powershell
.\tools\Install-SearchCommand.ps1
# or: .\tools\Install-SearchCommand.ps1 -ToolsDir C:\ai\tools
```

That copies `search.ps1`, `Invoke-FolderSearch.ps1`, `FolderS3.ps1`, `search.cmd`, and (when missing) `search.config.json` into `C:\ai\tools`, and appends that folder to the User PATH. New shells can then run `search` from any club GUID or host folder on `S:`.

```powershell
# After install: from a GUID folder on the S: mount
cd S:\a-clubs\www.example.com\11111111-1111-1111-1111-111111111111
search

# Host folder: require -All (one POST per GUID child)
cd S:\a-clubs\www.example.com
search -All

# Flags still override config
search -SearchApiUrl 'https://EXAMPLE.execute-api.eu-west-2.amazonaws.com' -AwsProfile a-search-redqueen-annotator

# From a repo checkout (without PATH install)
.\tools\search.ps1 -Path 'D:\s3\a-clubs\example.com\11111111-1111-1111-1111-111111111111'
```

Precedence: `-SearchApiUrl` / `-AwsProfile` > env (`A_SEARCH_API_URL` / `A_SEARCH_SEARCH_API_URL` / `A_SEARCH_AGENTS_AWS_PROFILE`) > `search.config.json` > `folder-tools.config.json` / `%ProgramData%\a-search\folder-tools.config.json` > optional CloudFormation stack output when a profile is set. Or set:

- `A_SEARCH_API_URL` / `A_SEARCH_SEARCH_API_URL`
- IAM SigV4 (`-AwsProfile` or config `AwsProfile`); no `x-agent-api-key` (FR #5086)
- `A_SEARCH_AGENTS_AWS_PROFILE`
- `A_SEARCH_S3_MOUNT` / `A_SEARCH_FOLDER_TOOLS_CONFIG` / `-ConfigPath`

Exit codes: `2` outside mount, `3` not a-clubs host/GUID, `4` host folder without `-All`,
`5` /search non-2xx or 2xx without `searchid` (FR #5096; prints `search_http_status=` / `search_error=`).
`Get-FolderMeta` also uses `5` for bucket root (FR #4087).

## onboard / Invoke-FolderOnboard.ps1

Discover new affiliate signups for a **provider** folder and register them under `a-affiliates` (no MFA for Awin).

```powershell
cd S:\a-affiliates\awin
onboard           # or: .\tools\onboard.ps1
onboard -WhatIf   # dry run: list would-create / would-delete; no S3 writes, no download
onboard -Max 5    # cap new folder creates
onboard -SkipDownload
onboard -SkipDeleteInactive
onboard -BackfillLogourl   # one-shot: HEAD folders missing logourl only when asked
```

**Awin (implemented):**

1. Read provider marker meta (`feedlisturl`, `feedurltemplate`, `feedapikey`, `publisherid`, …).
2. Download the product-data **Feed List** (apikey filled in memory only — same credential family as
   madeira-awin-clubscan product feeds; **no UI / OTP**).
3. Optional Bearer token (`apitoken` / `AWIN_ACCESS_TOKEN` / `C:\passwords\awin.apitoken.txt`) fetches
   `programmes?relationship=joined` for preferred `logoUrl` values. Without a token, `logourl` still
   uses the public profile CDN. URL only — onboard does **not** download logo image bytes.
4. For each `Membership Status = active` advertiser with no `awin/{id}/` folder: create the marker
   (`feedurl` keeps `{feedapikey}`, `enabled=1`, `source=onboard`, **required** `logourl`) and run `download`.
5. **Do not** re-check existing folders for `logourl` on every run (folders that already have it are left alone).
   Use `-BackfillLogourl` only for a one-shot catch-up of folders still missing the key.
6. **Joined, no product feed:** create/keep `enabled=0` `disabledreason=nofeed` folders (discount coupons /
   offers still matter). Missing from the Feed List alone never triggers delete.
7. **Delete not-joined only** (default): when the Publisher joined API is available, remove folders whose id is
   **not** in `programmes?relationship=joined`. Without apitoken, onboard does not delete. `-SkipDeleteInactive`
   leaves all folders alone.

Progress: host messages describe each step; long waits show a `/ | \ -` spinner on the same line.
Secrets are never printed. Report: final JSON on stdout + `C:\ai\a-search\logs\awin-onboard\{yyyy-mm-dd}.json`.

## download / Invoke-FolderDownload.ps1

Manual affiliate download for `a-affiliates` (FR #4108 / #4195). Reuses `affiliates/src/downloadOne` via `tools/run-folder-download.js` for the **product feed**, and for Awin also pulls **coupons/offers** via Publisher API (`tools/run-folder-coupons.js` → `{yyyy-mm-dd}.coupons.json`). Needs `C:\passwords\awin.apitoken.txt` (or `AWIN_ACCESS_TOKEN`) for coupons. Joined no-feed affiliates still download coupons (`feed=skipped_nofeed`).

Progress steps and `/|\|` spinner go to **stderr** (same style as onboard); summaries to **stdout**. Default **skips** when today's dated feed/coupons object already exists (`exists`); pass `-Force` to re-download.

**Batch selection (root / provider cwd):**
- Provider marker must have `enabled=1` (Awin is `1`; partnerize/impact/… are `0`). Disabled provider cwd exits `provider_disabled` (code 3).
- Merchant marker must have `enabled=1`.
- Due when `lastdownload` is empty or age ≥ resolved `defaultage` days. Precedence: merchant → provider → `_root/` (`s3://a-affiliates/_root/`, currently `defaultage=6`).
- `-All` ignores age; still skips disabled providers and merchants.
- `-Force` is orthogonal: overwrites today's dated objects once a merchant is selected.
- Selection uses a **parallel** Node head-object batch (`tools/batch-folder-head-meta.js`, concurrency 16) with a spinner — not one `aws.exe` per merchant (that looked hung on ~229 Awin folders).

```powershell
cd S:\a-affiliates\awin\<affiliateid>
download          # or: .\tools\download.ps1
download -WhatIf  # dry run: no HTTP, no S3 writes; feedurl shown as ***set***
download -Force   # overwrite today's dated feed/coupons
cd S:\a-affiliates\awin
download          # due merchants only (enabled=1, lastdownload older than defaultage)
download -All     # every enabled merchant under this enabled provider
cd S:\a-affiliates
download          # every enabled provider's due merchants
download -All     # every enabled provider's enabled merchants (ignore age)
```

Env: `A_SEARCH_S3_MOUNT` (redqueen: `S:\`; default falls back to `D:\s3`), `A_SEARCH_AGENTS_AWS_PROFILE` / `AWS_PROFILE` (default `a-search-redqueen-agents`), `A_AFFILIATES_BUCKET` (default `a-affiliates`). Never prints feed URLs, passwords, or tokens.

**AWS identity (FR #4167):** `Invoke-FolderDownload` resolves one profile (`-AwsProfile`, else `A_SEARCH_AGENTS_AWS_PROFILE`, else `AWS_PROFILE`, else `a-search-redqueen-agents`) and sets process `AWS_PROFILE` for the whole run so marker metadata reads (`aws s3api head-object` / tagging) and Node S3 writes use the same identity. Setting `A_SEARCH_AGENTS_AWS_PROFILE` alone is enough.

**WinPS 5.1 (FR #4167):** JSON args (including `affiliateMeta` / `feedurl`) are passed to Node via process env `A_SEARCH_FOLDER_DOWNLOAD_ARGS` and `run-folder-download.js --args-env`, not on the process command line (avoids 5.1 quote mangling and keeps the feed key out of Task Manager / process audit). Shims `download.ps1` / `meta.ps1` / `search.ps1` end with `exit $LASTEXITCODE` so `powershell -File` preserves tool exit codes.

Exit codes: `2` outside mount, `3` not an `a-affiliates` folder / `provider_disabled`, `5` missing `_root/` `defaultage`, `1` download/missing_feedurl/partial batch failure, `0` success (including `exists` skip / `no_due_merchants` / `no_enabled_providers`).

## dbimport / Invoke-FolderDbImport.ps1

Import dated affiliate feeds into **`a_search` on `walrus\asearch`**. Provider instructions live in `{provider}/_import/` (`config.json`, `IMPORT.md`, `sql/`).

| Cwd | Behaviour |
|-----|-----------|
| `S:\a-affiliates` | Every `enabled=1` provider that has `_import/` |
| `S:\a-affiliates\{provider}` | That provider when enabled |
| `S:\a-affiliates\{provider}\{id}` | That merchant only |

Upserts `dbo.Parts` and `dbo.AffiliateOffers`; soft-deletes rows missing from the batch; **deletes** the dated CSV/JSON after success. `-WhatIf` = parse + safety only. Each live parts load inserts `ingest.ImportRuns` / `ImportRunFeeds` (and `ImportFiles` when a file key is known) and stamps `dbo.Parts.LastSeenRunId` (FR #4947). Do not backfill the existing 1.8M NULL ids without Simon.

```powershell
cd S:\a-affiliates\awin\100597
dbimport -WhatIf
dbimport
```

## invite / invite.ps1

Cwd-aware invite dispatcher for `a-affiliates` (on PATH via `C:\ai\a-search\tools`). Loads `{provider}/_invite/` + `config.json`.

| Cwd | Behaviour |
|-----|-----------|
| `S:\a-affiliates` | Run invite for every provider with `enabled=1` |
| `S:\a-affiliates\{provider}` | That provider only when `enabled=1`; else `provider_disabled` (exit 3) |

An **`enabled=1` provider must have a registered invite backend**; otherwise `invite_not_implemented` (exit 4). Registered: **awin**, **rakuten** (FR #5065), and **cj** (FR #5066). Keep the CJ marker `enabled=0` until publisher activation (#5057); root `invite` then skips CJ. Do not enable download/dbimport for Rakuten (no `_import/`, no merchant feeds).

```powershell
cd S:\a-affiliates\awin
invite -Max 3           # dry-run (default)
invite -Live -Max 20    # submit joins
invite -Live -Max 1 -Otp 123456
cd S:\a-affiliates\cj
invite -Max 3           # CJ Advertiser Lookup dry-run (needs token file)
cd S:\a-affiliates
invite -Max 3           # all enabled=1 providers
```

| Exit | Meaning |
|------|---------|
| `2` | Needs OTP / captcha (stop and ask Simon) |
| `3` | Wrong cwd or `provider_disabled` |
| `4` | `invite_not_implemented` |
| `5` | `cj_account_not_active` (CJ 403; no records written) |

Awin: `C:\ai\a-search\awin-agent\README-invite.md`. Rakuten: `redqueen/invite/` + seed `a-affiliates/rakuten`. CJ: seed `redqueen/affiliate-agent/seed/a-affiliates/cj/AGENT.md` and backend `redqueen/cj-invite/` (copy to `C:\ai\a-search\cj-invite` on redqueen). Reports: `logs\{provider}-invite\{yyyy-mm-dd}.json`.

## Tests

```powershell
Invoke-Pester .\tests\fr4043-folder-tools.Tests.ps1
Invoke-Pester .\tests\fr4108-folder-download.Tests.ps1
Invoke-Pester .\tests\fr4167-folder-download-winps.Tests.ps1
node --test tests/fr4108-folder-download.test.js
node --test tests/fr4167-folder-download-winps.test.js
```

Mocks cover mapping, secret masking, empty annotations, `-Json`, outside-mount exit 2, GUID/host search, download cwd/dry-run/secrets, no credentials in output, WinPS args-env handoff, shim exit codes, and unified AWS profile.
