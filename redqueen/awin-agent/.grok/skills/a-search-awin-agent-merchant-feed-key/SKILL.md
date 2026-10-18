---
name: a-search-awin-agent-merchant-feed-key
description: >
  FR #4126 Merc playbook for redqueen/awin-agent. Register a joined Awin merchant's product feed as an a-affiliates folder:
  create or merge s3://a-affiliates/awin/{advertiserid}/ (zero-byte, AES256)
  with the required metadata, feedurl holding the {feedapikey} placeholder,
  and enabled=1 only after the feed is tested. Existing folders are merged,
  never recreated. Use after a-search-awin-agent-feed-link-pulls, or for folders with
  enabled=0. Full rules: s3://a-affiliates/awin/AGENT.md.
---

# Awin merchant feed key: a-affiliates folder writer (onboarding CWD)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never put a password, OTP, IMAP app password, API token, feed URL (it carries an apikey), or publisher id in a filing, skill, or log.

## When to use

- A joined merchant has a row in `FEEDS_SCRATCH_PATH` (feed or no-feed).
- An `awin/{id}/` folder has `enabled=0` and its reason may now be resolved.

## Inputs

| Input | Source |
|---|---|
| Rows `{id, name, fid, feedUrl, primary}` | `FEEDS_SCRATCH_PATH` (from `a-search-awin-agent-feed-link-pulls`) |
| Programme details (optional) | Awin UI / read API: `website`, `currency`, `sector` |
| Provider marker | `aws s3api head-object --bucket a-affiliates --key awin/`. It holds `feedurltemplate` and the secret `feedapikey` / `darwinhash` (keep them in memory only) |
| Rules | `s3://a-affiliates/awin/AGENT.md` (wins on any conflict) |

## Steps

1. **Validate the id.** The advertiser id is digits only. It becomes the
   folder name, `affiliateid` and `awinmid`.
2. **Build `feedurl` with the placeholder.** Take the real URL from scratch
   (or `feedurltemplate` with `{feedid}` filled in) and replace the key
   segment with the literal `{feedapikey}` (or `{darwinhash}` for darwin
   hash feeds). The stored `feedurl` must never contain the real key, which
   lives only on the `awin/` provider folder. Set `feedid` to the fid,
   comma-separated if there are several, primary first.
3. **Test the feed before `enabled=1`.** Substitute the key in memory only and
   request the URL with a range/size limit. Pass = HTTP 200, gunzip works (when
   `compression=gzip`), and there is a CSV header plus at least one data row.
   Don't save the file (the AWS download task owns `parts/`), and never log the
   substituted URL. Then set:
   - pass: `enabled=1` (with `feedid`, `feedurl`)
   - no feed: `enabled=0`, `disabledreason=nofeed`
   - not joined: `enabled=0`, `disabledreason=notjoined`
   - not tested yet: `enabled=0`, `disabledreason=untested`
   - test failed: `enabled=0`, `disabledreason=feederror`
4. **Build the metadata** (lower-case keys, ASCII values):
   - Required: `affiliateid`, `awinmid` (both = folder name), `name` (ASCII-folded),
     `format=csv`, `compression` (`gzip`/`zip`/`none`, from the URL),
     `schedule=weekly`, `enabled`, `lastmod` (ISO UTC now).
   - When `enabled=1`: `feedid`, `feedurl` as well.
   - When `enabled=0`: `disabledreason`.
   - Optional: `joined`, `website`, `currency`, `sector`, `source=agent`.
   - `lastdownload`, `laststatus`, `lastsize`: leave **empty** (the downloader owns them).
   - Check that the total of keys plus values is **under 2 KB**. If it isn't,
     trim the optional keys.
5. **Head-object** `awin/{id}/`.
   - **404, create:** `put-object` with a zero-byte body, the key ending in
     `/`, `--server-side-encryption AES256` and `--metadata file://meta.json`.
   - **Exists, merge, never recreate:** start from the existing metadata and
     merge the new keys in. Keep every key you are not changing, and **never
     reset `lastdownload` / `laststatus` / `lastsize`**. Then `copy-object` the
     folder onto itself with `--metadata-directive REPLACE`,
     `--server-side-encryption AES256` and `--metadata file://merged.json`.
     Never delete and re-put. (Commands: comment 1/4.)
   - Don't downgrade a verified folder: if it already has `enabled=1` and today's test failed, set `enabled=0, disabledreason=feederror` only when the failure is confirmed on a retry.
6. **Verify:** head-object again. Check the key ends in `/`, `ContentLength=0`,
   `ServerSideEncryption=AES256`, the required keys are present, `feedurl`
   contains `{feedapikey}` / `{darwinhash}` and no real key, and the `last*`
   values are unchanged.
7. Record `{id, name, action: created|merged|unchanged, enabled, disabledreason}`
   for the run report. No URLs.

In `-DryRun` mode, do steps 1 to 4 and the head-object. Report what would be
created or merged (with secrets masked as `***`), and write nothing.

## Success criteria

- Each joined merchant ends with exactly one `awin/{id}/` folder that meets
  the contract. There are no duplicates, and existing `last*` state survives.
- `enabled=1` only on folders whose feed was tested and returned data. Every
  `enabled=0` folder has a `disabledreason`.
- No real key in any advertiser folder's metadata, output, report or log.

## Failure modes / stop rules

| Symptom | Action |
|---|---|
| S3 AccessDenied | Stop the batch and report it. Do not try other credentials |
| Metadata over 2 KB | Drop the optional keys. If it still doesn't fit, use `awin/{id}/affiliate.json` per AGENT.md |
| `feedurl` would hold a real key | Stop for that merchant, fix the placeholder, and never write it |
| Feed test fails / times out | `enabled=0`, `disabledreason=feederror`. Retry next run |
| Folder name not digits only | Skip and report it. Never write a non-numeric folder |

## Security

- The real feed key and darwin hash stay on the `awin/` provider marker. Only
  the placeholder goes on advertiser folders.
- Never write to the old partner portal or madeiradb, and never touch
  `awin/{id}/parts/`. Never delete folders.

## Legacy: partner portal Add Key (do not use for #4123)

Before a-affiliates, Merc registered feeds in the Club Madeira partner portal
(partner.clubmadeira.io). He signed in as the merchant
(`{advertiserId}@awin.com`, after the ~08:00 UK clubscan run had created the
user), used Add Key with provider Awin, store name and feed URL, then
re-checked the key count and logged out before the next merchant.

The bulk version was the recovered `add_keys_from_feeds.py`. In plain words:
it reads a JSON list of `[{id, name, feedUrl, fid}]` and skips rows with no
`feedUrl` or `skip: true`. For each row it logs in to the partner API as
`{id}@awin.com`, using the advertiser id itself as the password (a known weak
convention, to be mentioned only here). It posts a new api-key with type
`awin`, `Description` = the store name and `settings.feedUrl` = the feed URL.
It re-reads the merchant's api-keys to check the key count went up, then
discards the token before the next merchant. It never prints `feedUrl`, and
its results file leaves it out.

**Going forward, an S3 metadata writer (this skill) replaces it.** The #4123
agent never writes to the partner portal.
