# affiliates/ (FR #5070)

`affiliates/bucket/` mirrors the code, config and agent-instruction objects in `s3://a-affiliates/`, using the same keys.
Git is the source of truth for these files. Nobody should edit S3 directly.

- `MANIFEST.json` records each object's S3 key, size, last-modified time, ETag (MD5) and sha256 at import time (2026-10-27, profile `a-search-redqueen-agents`).
- `tests/fr5070-affiliates-bucket-manifest.test.js` checks that the committed bytes match the manifest.
- `.gitattributes` marks `affiliates/bucket/**` as `-text`, so git never normalises line endings (some files are CRLF).

Not imported: data and records. That covers merchant folders `awin/{id}/` (markers and dated feeds), `awin/_invites/` records, and zero-byte provider markers. No `.env` or secret files were present.

## Deploy (repo -> S3)

`tools/deploy-a-affiliates.ps1` (default `-WhatIf`; `-Check` HeadObject drift; `-Apply` puts with `--sse AES256`).
Managed keys come from `MANIFEST.json` only. Never deletes. Never touches `_invites/`, `_applications/`, or merchant folders.
Runtime-written `SKILLS.md` files are **skipped** unless `-IncludeSkills` (prefer pull S3 back into git).
Awin invite runtime entry is `redqueen/awin-agent/scripts/invite.mjs` (Playwright); merchant data stays on `S:\a-affiliates\awin` via `AWIN_AFFILIATES_ROOT`.

After a deliberate re-import, update `MANIFEST.json`. The manifest test fails on any drift.
