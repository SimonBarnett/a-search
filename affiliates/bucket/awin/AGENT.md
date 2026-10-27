> **Load order (AGENTS.md section 1):** `../AGENTS.md`, then `../SKILLS.md`, then this file, then `SKILLS.md` in this folder
> (`S:\a-affiliates\awin\SKILLS.md`). This file has only Awin-specific details. It wins over AGENTS.md only on those details.

# Awin provider: agent instructions

Location: `s3://a-affiliates/awin/AGENT.md` (`S:\a-affiliates\awin\AGENT.md`). Specs: a-search #3999, #4108, #4123.
Seeded from madeiradb (read-only) on 2026-10-18: 244 advertiser folders.

## 1. Who runs this: the daily Awin agent (a recreation of Merc)

Simon (2026-10-18 13:43 BST): "basically we are recreating him as an agent that gets some runtime everyday to invite/add more awin".

- The a-search **Awin agent** is a recreation of **Merc**, Simon's Awin agent. Merc stays the reference and backup operator.
- Start it with `agent` from `S:\a-affiliates\awin`. The daily scheduled run uses the same entry point (#4123).
- Run order:
  1. Sign in (section 3).
  2. Find newly joined or approved advertisers (My Programmes, plus the Welcome mailbox) and create or merge their
     `awin/{advertiserid}/` folders (always set required `logourl`; on merge add `logourl` only if missing — AGENTS.md).
  3. Straight after creating a new `awin/{advertiserid}/` folder with a tested feed, `cd` into it and run `download`
     (#4108), so the first data arrives on day 0. Record the result in the run report. After that, only the daily
     download job refreshes it (FR pending).
  4. Send joins from **Join Programmes / notJoined** via the deterministic `invite` tool
     (`C:\ai\a-search\tools\invite.ps1` / `awin-agent\scripts\invite.mjs`), within daily limits and AGENTS.md section 9
     (90-day `_invites` via `invitedat`; personalised messages from scraped fields; zero LLM).
  5. Raise no-feed follow-ups.
  6. Write the run report.
  7. Harvest skills (AGENTS.md section 13): Awin-only lessons go to `awin/SKILLS.md`, general ones to `../SKILLS.md`.
     Also harvest straight away whenever you learn something during the run.

## 2. Awin ids, URLs and provider-folder keys

- Publisher id: **`2889699`** (Club Madeira). Advertiser id = Awin `advertiserId` / `merchantId` / `awinmid`, **digits only**.
  The folder is `awin/{advertiserid}/`, and `affiliateid` = `awinmid` = the folder name.
- UI: `https://ui.awin.com/login` (email-first IdP at `id.awin.com`). API: `https://api.awin.com`.
- `awin/` marker keys: `name`, `provider`, `loginurl`, `apibase`, `publisherid`, `authtype`, `instructions=AGENT.md`,
  `feedurltemplate`, `feedlisturl`, `deeplinktemplate`, `source`, `lastmod`.
  Secret keys: `feedapikey` (set), `darwinhash` (set), and `username`, `password`, `apitoken`. Keep `username` /
  `password` / `apitoken` **empty on the marker**. UI login uses `C:\passwords\awin.secret.txt`. Publisher API Bearer
  token uses **`C:\passwords\awin.apitoken.txt`** (line 1 = token only; SYSTEM + Administrators ACL). Env override:
  `AWIN_ACCESS_TOKEN`. `apitoken` is read-only (programme lists, logoUrl, nofeed/coupon folders, not-joined deletes).
  **Joins and invites have no write API**, so they go through the UI.
- **How to get the Publisher API token:** sign in to ui.awin.com → user menu → **API Credentials** (or
  `https://ui.awin.com/awin-api`) → enter account password → **Show my API token** → copy. Paste as the single line in
  `C:\passwords\awin.apitoken.txt`. Never put the token in chat logs, AGENT.md, or the S3 marker. Revoke/regenerate on
  the same API Credentials page if leaked.
- Deep link (our affiliate id + tenant id):
  `https://www.awin1.com/cread.php?awinmid={awinmid}&awinaffid={publisherid}&clickref={tenantid}&ued={url-encoded product url}`.

## 3. Sign-in (Merc's mechanism)

- Credential file: **`C:\passwords\awin.secret.txt`** on redqueen, with its ACL limited to SYSTEM and Administrators.
  It has two CRLF lines: **line 1 = email, line 2 = password**. Line 1 goes only in the email field, and only line 2 goes in the password field.
  Read it in-process and fill the field directly: no temp file, no clipboard, never echoed or logged (#4123, answers comment).
  Agents never create, copy, move or print this file, and never read Simon's own copy on MarchHare.
- Use the persistent browser profile under `C:\ai\a-search\awin-agent\profile\`. Awin asks for an OTP only on a new device or after a long gap.
- **OTP:** the file holds no OTP, and only Simon's authenticator can give one. When **`id.awin.com/u/mfa-otp-challenge`**
  appears, **stop and ask Simon for the code** (settled). Treat a captcha the same way.

## 4. Inviting and joining

- Candidates: UI > Advertisers > **Global Recommendations** and Join Programmes. API (read-only, once `apitoken` is set):
  `GET {apibase}/publishers/2889699/programmes?relationship=notjoined&countryCode=GB` and
  `GET {apibase}/publishers/2889699/programmedetails?advertiserId={id}`.
- Prefer advertisers that have a product feed, a high approval rate and prompt payment status, and that suit club and model-club members.
- In the join form: promotion type, Promotion URL, and the message.
- **Awin message limit: Awin caps the join message at 150 characters, so the hard limit is 149 characters.** Write each
  message for that advertiser (its name, sector and products, and why they suit Smart Catalogue / Club Madeira members).
  Never use a template. Check `length <= 149` before submitting; regenerate or trim at a word boundary if it's over.
  Store it as `invitemsg` on `awin/_invites/{advertiserid}/`.
- Default daily limits: 20 joins (`AWIN_MAX_JOINS` / `invite -Max`). Scheduled job: `invite` (dry-run default; `-Live` to submit).
  On OTP: exit 2 and ask Simon; tick trust-this-machine. Promo URL: `https://www.clubmadeira.uk/for-awin-advertisers`.

## 5. Approvals, welcomes and feeds

- Approvals: UI "My Programmes" (joined), or API `programmes?relationship=joined`. Compare with the existing `awin/{id}/` folders.
- Welcome monitor: IMAP `si@ntsa.uk`, folder `INBOX/Awin/Welcome`.
- Feed links: UI Toolbox > **Create-a-Feed**, or the **Feed List export** at
  `https://productdata.awin.com/datafeed/list/apikey/{feedapikey}` (CSV of every feed: Advertiser ID, Feed ID,
  Membership Status, Language, No of products). Pick `Membership Status = active`, language `en` where possible.
- **Feed URL formats**, which go into `feedurl` with the secrets as placeholders:
  - Standard: `https://productdata.awin.com/datafeed/download/apikey/{feedapikey}/language/en/fid/{feedid}/rid/0/hasEnhancedFeeds/0/columns/{columns}/format/csv/delimiter/%2C/compression/gzip/adultcontent/1/`
    (see `feedurltemplate` on the `awin/` marker). Without `/format/` the default is csv; without `/compression/` it's `none`.
    `fid` can list several feeds, comma-separated.
  - Darwin: `https://ui.awin.com/productdata-darwin-download/publisher/2889699/{darwinhash}/1/feed/F{feedid}.csv.gz`
    (csv, gzip). The hash is a secret, kept only as `darwinhash` on the `awin/` marker.
- Test the feed before `enabled=1`: HTTP 200 and the CSV header (`aw_deep_link,product_name,...`) after gunzip. Fill the key in
  in memory only and never log the filled URL. Approved but no product feed: keep/create `enabled=0`
  `disabledreason=nofeed` (discount coupons / offers still useful). `onboard` deletes only when the Publisher
  joined API says the advertiser is not joined — never solely because they are missing from the Feed List.
- Awin-specific keys on `awin/{id}/`: `awinmid` (required for links), `logourl` (**required** HTTPS advertiser logo URL), plus optional `joined`, `website`, `currency`, `sector`,
  and reseed-only `madeirauserid`, `madeiraclubid`, `madeirapartnerid`, `madeirastatus`, `madeiraparts`.
- **logourl source (Awin):** `onboard` always writes `logourl`. Prefer `logoUrl` from `GET {apibase}/publishers/{publisherid}/programmes?relationship=joined` (Publisher API Bearer token), https-normalized. If that is missing or `apitoken` is unset, use `https://ui.awin.com/images/upload/merchant/profile/{advertiserid}.png`. URL only — no image-byte download. Do not use a product feed image.

## Download format

**Known:** Awin delivers **CSV, gzip** (standard feed URL `.../format/csv/delimiter/%2C/compression/gzip/...`; Darwin `F{feedid}.csv.gz`). Set `format=csv`, `compression=gzip`. The file lands as `awin/{id}/{yyyy-mm-dd}.csv` (plain CSV, header `aw_deep_link,product_name,aw_product_id,...`). Verified on `awin/1902` 2026-10-18.
- Supported on the markers: `format` = `csv` | `tsv` | `xml` | `json`; `compression` = `gzip` | `zip` | `none`. The affiliate marker wins; if it has no value the provider marker's `format`/`compression` is used.
- `download` decompresses the feed and writes exactly one file into the merchant folder: `{provider}/{affiliateid}/{yyyy-mm-dd}.{ext}` (ext = format). No `parts/` folder, no `latest` copy, no backups. The DB import reads the file and deletes it.
- An unknown `format` or `compression` stops the download (`unsupported_format` / `unsupported_compression`) and nothing is written. Fix the marker, then run `download` again.

## 6. Playbooks: Merc's skillbooks (posted on #4123)

The skill texts are in #4123 comments 1/4 to 4/4:
- 1/4 overview, config, folder contract: https://github.com/SimonBarnett/a-search/issues/4123#issuecomment-6250156586
- 2/4 sign-in, welcome monitor, feed link: https://github.com/SimonBarnett/a-search/issues/4123#issuecomment-6250157543
- 3/4 merchant feed key, daily signups: https://github.com/SimonBarnett/a-search/issues/4123#issuecomment-6250158558
- 4/4 join, invite metrics, no-feed follow-up, merc-hostile-mrb: https://github.com/SimonBarnett/a-search/issues/4123#issuecomment-6250159731
 Planned path: `providers/local/awin/onboarding/.grok/skills/`.
Their operational lessons are merged into `awin/SKILLS.md` (2026-10-18); the bucket copies under `awin/.grok/` are retired stubs.
Implementation: PR #4127.

| skill | use for |
|---|---|
| `a-search-awin-publisher-sign-in` | sign-in (section 3) |
| `a-search-awin-welcome-monitor` | welcome emails |
| `a-search-awin-feed-link` | Create-a-Feed / Feed List export |
| `a-search-awin-merchant-feed-key` | writing `awin/{id}/` folders |
| `a-search-awin-daily-signups` | daily new joiners |
| `a-search-awin-join-programme` | joins from Global Recommendations |
| `a-search-awin-invite-metrics` | invite/skip metrics |
| `a-search-awin-no-feed-follow-up` | approved advertisers with no feed |
| `merc-hostile-mrb` | review checklist |

Where a skill text differs from AGENTS.md or this file, these files win. In particular, the skills' legacy partner-portal
Add Key flow is **not** used, and sign-in fills the password in-process, with no temp file.
