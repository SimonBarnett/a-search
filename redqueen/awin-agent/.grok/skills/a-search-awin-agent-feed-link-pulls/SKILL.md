---
name: a-search-awin-agent-feed-link-pulls
description: >
  FR #4126 Merc playbook for redqueen/awin-agent. Get the Awin product-data feed download URLs for joined merchants, either
  in one go from the Feed List export on the Create-a-Feed page or per
  merchant through Toolbox > Create-a-Feed (CSV + gzip house style). Handles
  merchants with several feed ids and merchants with no feed, and saves the
  URLs to a local gitignored scratch file without ever printing them. Use when
  a newly joined merchant needs its a-affiliates folder, or a folder has
  enabled=0 disabledreason=nofeed.
---

# Awin product-data feed link (onboarding CWD)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never put a password, OTP, IMAP app password, API token, feed URL (it carries an apikey), or publisher id in a filing, skill, or log.

## When to use

- `a-search-awin-agent-daily-signups` needs a feed URL for a merchant.
- An `a-affiliates/awin/{id}/` folder has `enabled=0` with `disabledreason`
  `nofeed` or `untested`.

## Inputs

| Input | Source |
|---|---|
| Merchant list `[{id, name}]` | My Programmes (Joined) / Welcome monitor / daily-signups |
| `AWIN_PUBLISHER_ID` | `.env` |
| Signed-in Awin session | `a-search-awin-agent-publisher-signin` |
| Output file | `FEEDS_SCRATCH_PATH` (gitignored) |

## Steps

1. Confirm each merchant is **joined** on My Programmes
   (`https://ui.awin.com/awin/affiliate/{AWIN_PUBLISHER_ID}/merchant-directory/index/tab/active`).
   If it isn't joined, mark it `notjoined` and skip it, because the feed
   builder won't list it.
2. **Fast path: Feed List export.** Open Create-a-Feed
   (`https://ui.awin.com/awin/affiliate/{AWIN_PUBLISHER_ID}/datafeed/step-one`)
   and use **Feed List** export. One file gives CSV + gzip download URLs for
   **every joined feed at once** (with Advertiser ID, Feed ID, Membership
   Status, Language and product count). It is equivalent to
   `productdata.awin.com/datafeed/list/apikey/{feedapikey}`. Pick each
   merchant's rows with `Membership Status = active`, preferring language `en`.
   The export carries the real key, so save it only under `.scratch/`, never
   print it, and delete it after the run.
3. **Per-merchant path** (when the export lacks a merchant, or you need custom
   options): select the advertiser on Create-a-Feed. House style is **CSV**,
   compression **gzip**, the default/standard column set (don't trim columns
   the downstream parser relies on), and language/region matching the
   merchant's store. Continue to the download step (`…/datafeed/download/`)
   and copy the generated URL. It is a `productdata.awin.com` URL with `fid`
   and the account **apikey** embedded, so the whole URL is a secret.
4. **Multiple feed ids:** some merchants publish several feeds (`fid`s, e.g.
   one per country or category). Record each as its own row
   `{id, name, fid, feedUrl}` and mark the main UK feed `primary: true`. The
   folder's `feedid` can list several, comma-separated (see the folder
   contract).
5. **No feed:** if the merchant is joined but doesn't appear in the Feed List
   or Create-a-Feed, record
   `{id, name, feedUrl: null, reason: "nofeed"}` and hand it to
   `a-search-awin-agent-nofeed-followup`. Known cases: Lunzo, Lapert.
6. Write rows to `FEEDS_SCRATCH_PATH` as JSON:
   `[{"id": <advertiserId>, "name": "<store name>", "fid": <fid|null>, "feedUrl": "<secret>|null", "primary": true}]`.
7. In chat / reports, show only `id`, `name`, `fid` and `feedUrl present: yes/no`.
   When a URL shape must be shown, replace the key with `{feedapikey}`.

## Success criteria

- Every joined merchant in the input has either a feed row or a recorded
  no-feed reason.
- The scratch file is gitignored (`git check-ignore` returns its path).
- No feed URL, apikey or `productdata.awin.com/...apikey...` string with a real
  key appears in output, intake, IRC, reports or commits.

## Failure modes / stop rules

| Symptom | Action |
|---|---|
| Builder or export shows login HTML / an empty advertiser list | The session expired. Re-run sign-in once |
| Merchant joined but missing from builder and export | Do not hand-build a URL by guessing `fid`. Record `nofeed` |
| Download URL returns 0 rows / 404 | Record `feederror`. Keep the row (the merchant may publish later) and flag it in the report |
| You accidentally printed a URL or the key | Stop. Tell Simon the feed apikey may need rotating in Awin, and file a redacted intake issue |

## Security

- The feed URL carries the account apikey. Never print it or commit it, and
  never put it in a filing, skill, issue, PR or log. Keep it only in the
  gitignored scratch file. In S3 it is stored with the `{feedapikey}`
  placeholder (see `a-search-awin-agent-merchant-feed-key`).
- Never copy the apikey on its own into `.env` or a skill. Its only home is the
  `awin/` provider marker.
