> **Read `../AGENTS.md` (`s3://a-affiliates/AGENTS.md`, `S:\a-affiliates\AGENTS.md`) first.** This file has only AvantLink-specific details.

# AvantLink provider: agent instructions

> **HOLD:** GBP market hold (docs/provider-shortlist.md, FR-255): US outdoor/retail. Stay dark until Simon lifts the hold.

Location: `s3://a-affiliates/avantlink/AGENT.md`. Status: **provider folder only, `enabled=0`.** No affiliate folders yet
(madeiradb had no AvantLink sellers on 2026-10-18).
Repo source: providers/local/avantlink (registry class=affiliate, kind=local, **enabled=false**); docs/provider-shortlist.md GBP market HOLD (FR-255).

## Ids
- `{affiliateid}` = the AvantLink merchant id. Folder: `avantlink/{affiliateid}/`.
- Our account ids (provider-marker keys, empty until set): `ouraffiliateid`.

## URLs
- Login (UI): https://classic.avantlink.com/signin. API: https://classic.avantlink.com/api.php (authtype `token`). These come from public docs; verify them at enable.

## Join / sign-up flow
Apply to merchants in AvantLink. Stub; UNKNOWN.
Invite records and the 90-day rule follow AGENTS.md section 9. **Message limit: UNKNOWN.** Check the join form's limit at the
first join and record it here before sending.

## Feed / API format
Product datafeeds per merchant (repo: `AVANTLINK_FEED_URL`/`_API_KEY`/`_FEED_TOKEN`).
Default `format=csv`, `compression` as the feed URL says, `schedule=weekly`, `enabled=1` only after the feed is verified.

## Download format

**Not known yet** (on hold): set `format`/`compression` on the marker once a feed is tested.
- Supported on the markers: `format` = `csv` | `tsv` | `xml` | `json`; `compression` = `gzip` | `zip` | `none`. The affiliate marker wins; if it has no value the provider marker's `format`/`compression` is used.
- `download` decompresses the feed and writes exactly one file into the merchant folder: `{provider}/{affiliateid}/{yyyy-mm-dd}.{ext}` (ext = format). No `parts/` folder, no `latest` copy, no backups. The DB import reads the file and deletes it.
- An unknown `format` or `compression` stops the download (`unsupported_format` / `unsupported_compression`) and nothing is written. Fix the marker, then run `download` again.

## Deep link (our affiliate id + tenant id)
Repo params: affiliate `pw`, merchant `mi`, tenant `ctc`. Form: `https://www.avantlink.com/click.php?tt=cl&mi={affiliateid}&pw={ouraffiliateid}&ctc={tenantid}&url={url-encoded product url}`.
Source: `shared/links/networkParams.js` (FR-248).

## On hold (FR-255): do not sign up until Simon lifts the hold

Repo: `providers/local/avantlink/.grok/skills/a-search-avantlink-onboarding/SKILL.md` (**stub**, UNKNOWN), `.env.example`, `docs/provider-shortlist.md` (GBP market hold), issue #1660.
Kept for later only. Lines are *(public docs, verify)*.

1. Signup: https://www.avantlink.com/affiliates/ (affiliate sign-up). *(public docs, verify)*
2. Use the same identity as the active networks (contact `si@clubmadeira.uk`, Club Madeira / Smart Catalogue, company details and tax/bank from **Simon**).
3. Expect email verification, site verification, a tax form (US networks: **W-8BEN-E**), bank details and manual review. *(public docs, verify)*
4. Ids: affiliate/website id goes in `ouraffiliateid` (repo `AVANTLINK_AFFILIATE_ID`, link param `pw`). API: API key (Account > API) goes in `apikey`, entered by **Simon** via secure entry; UI login in `C:\passwords\avantlink.secret.txt`.
5. Deep link (repo `networkParams.js`): merchant `mi`, tenant `ctc`.

**Checklist** (do nothing until the hold is lifted)
- [ ] Simon lifted the hold (record date and issue)
- [ ] Account created and verified; tax and bank done (Simon)
- [ ] Secrets in place (Simon); ids set; first programme and feed tested

## Open: needs publisher account / credentials
- No AvantLink publisher account details are recorded in a-search, a-affiliates or madeiradb.
- Secret keys on `avantlink/` exist only as **empty** fields: `username`, `password`, `apitoken`, `apikey`, `feedtoken`. Simon adds them by secure entry;
  the UI login goes in `C:\passwords\avantlink.secret.txt` (Awin format). Never print them.
- Before any run: confirm the account, ids, sign-in/OTP behaviour, feed access and the message limit, then update this file.
- Until then the agent does nothing for this provider beyond reading this file.
