# Redqueen daily affiliate import (FR #4001)

Deterministic Windows Scheduled Task on **redqueen** that imports
`a-affiliates/{provider}/{affiliateid}/parts/{yyyy-mm-dd}.*` into the
**asearch** database on walrus, prunes removed parts from
`a-clubs/{host}/{guid}/live.json`, then deletes the processed file.

Part of [#3944](https://github.com/SimonBarnett/a-search/issues/3944). Follows
[#3999](https://github.com/SimonBarnett/a-search/issues/3999) (bucket + weekly
download). Related: [#3987](https://github.com/SimonBarnett/a-search/issues/3987)
(annotation agent).

## Schedule

| Item | Value |
|------|-------|
| Task name | `a-search-affiliate-import` |
| Default time | daily **03:30** (machine local; ops set Europe/London on redqueen) |
| Install | `redqueen/affiliate-import/install/Register-AffiliateImportTask.ps1` |
| Entry | `node redqueen/affiliate-import/src/cli.js` |
| Lock | `%ProgramData%\a-search\affiliate-import.lock` (task + fixing agent) |
| Log | `%ProgramData%\a-search\affiliate-import.log` |

Manual rerun: same `node .../cli.js` with
`A_SEARCH_AFFILIATE_IMPORT_WIRED=1` and site injectors.

## Flow

1. Acquire lock (exit 2 if held).
2. List pending dated parts files (oldest first). Skip `parts/latest.*` if still
   present from #3999. If none: log `nothing to do`, exit 0.
3. Per file (one affiliate failure does not stop others):
   - Load affiliate marker metadata (`format`, `compression`) --- never log
     provider login secrets from #3999.
   - Parse feed -> part keys `(provider, affiliateid, partid)`.
   - Upsert into **asearch** `dbo.Parts` (Source/FeedKey/MerchantProductId/Env=live)
     via staging + set-based MERGE (same shape as maintainer FR-014/015).
   - Soft-delete parts missing from the file for that affiliate only.
   - **Safety guard:** empty/unparseable feed, or would remove more than
     `maxRemoveRatio` (default **0.5**) of that affiliate's active parts ->
     roll back, keep file, fail that affiliate.
   - Prune matching entries from `live.json` using `dbo.PartLiveIndex`
     (no full-bucket scan). Match keys:
     `provider|source` + `affiliateId|feedKey` + `partId|merchantProductId|id`.
   - Bump GUID `lastmod` and host `lastmod` (#3968 rules); leave `init` alone.
   - On success: delete the S3 object; patch affiliate metadata
     `lastimport`, `importstatus=ok`, `importcount`, `removedcount`, `lastmod`.
4. If any affiliate failed: start a fixing agent (Grok first; Cursor only when
   Grok tokens are exhausted). Agent brief includes log path and FR rules.
   Exit 1.

## Interaction with #3999 / #3987

- **#3999:** once import deletes each processed file, the weekly download does
  not need `parts/latest` or keep-last-N retention for the import path. Download
  only writes the dated file; if an unprocessed file remains, a new dated file
  sits beside it and import handles oldest first.
- **#3987:** prune bumps GUID `lastmod`, so the annotation agent treats the GUID
  as stale. **Wanted** --- live.json content changed and annotations should
  refresh.

## Access (redqueen)

- IAM: read/delete on `a-affiliates`; read/write on `a-clubs` `*/live.json` and
  host/GUID marker metadata. Dedicated least-privilege user/role; never copy
  credentials off redqueen.
- DB: write to **asearch** on walrus over the LAN. Never madeiradb. No inbound
  ports; nothing in AWS opens SQL.

## Module map

| Path | Role |
|------|------|
| `src/runImport.js` | orchestration + lock |
| `src/parseFeed.js` | csv/json/xml (+ gzip) |
| `src/upsertImport.js` | set-based upsert + scoped delete |
| `src/pruneLiveJson.js` | live.json prune + lastmod |
| `src/partIndex.js` | in-memory index (SQL: `sql/001_PartLiveIndex.sql`) |
| `src/triggerAgent.js` | Grok/Cursor fix agent + log redaction |
| `src/safetyGuard.js` | empty / >50% remove guard |
| `tests/fr4001-affiliate-import.test.js` | acceptance pins |
