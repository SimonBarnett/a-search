> **Read `../AGENTS.md` (`s3://a-affiliates/AGENTS.md`, `S:\a-affiliates\AGENTS.md`) first.** This file has only Partnerize-specific details.

# Partnerize provider: agent instructions

Location: `s3://a-affiliates/partnerize/AGENT.md`. Status: **provider folder only, `enabled=0`.** No affiliate folders yet
(madeiradb had no Partnerize sellers on 2026-10-18).
Repo source: providers/local/partnerize (registry class=affiliate, kind=local, enabled live+sandbox, FR-172); shared/links/networkParams.js; .env.example (FR-084/085).

## Ids
- `{affiliateid}` = the Partnerize campaign id. Folder: `partnerize/{affiliateid}/`.
- Our account ids (provider-marker keys, empty until set): `publisherid`, `camref`.

## URLs
- Login (UI): https://console.partnerize.com/login. API: https://api.partnerize.com (authtype `basic`). These come from public docs; verify them at enable.

## Join / sign-up flow
Apply to brand campaigns in the Partnerize console (Campaigns > Browse/Apply). The repo's onboarding skill is a stub: credential steps are UNKNOWN.
Invite records and the 90-day rule follow AGENTS.md section 9. **Message limit: UNKNOWN.** Check the join form's limit at the
first join and record it here before sending.

## Feed / API format
Product feeds per campaign (repo: `PARTNERIZE_FEED_URL`/`_API_KEY`/`_FEED_TOKEN`; the feed URL is the durable locator). Store `feedid` and `feedurl` with secrets as `{feedtoken}`/`{userapikey}` placeholders.
Default `format=csv`, `compression` as the feed URL says, `schedule=weekly`, `enabled=1` only after the feed is verified.

## Download format

**Not known yet:** set `format`/`compression` on the marker once the first campaign feed is tested.
- Supported on the markers: `format` = `csv` | `tsv` | `xml` | `json`; `compression` = `gzip` | `zip` | `none`. The affiliate marker wins; if it has no value the provider marker's `format`/`compression` is used.
- `download` decompresses the feed and writes exactly one file into the merchant folder: `{provider}/{affiliateid}/{yyyy-mm-dd}.{ext}` (ext = format). No `parts/` folder, no `latest` copy, no backups. The DB import reads the file and deletes it.
- An unknown `format` or `compression` stops the download (`unsupported_format` / `unsupported_compression`) and nothing is written. Fix the marker, then run `download` again.

## Deep link (our affiliate id + tenant id)
Repo params: affiliate `camref`, tenant `pubref`. Partnerize link form: `https://prf.hn/click/camref:{camref}/pubref:{tenantid}/destination:{url-encoded product url}`.
Source: `shared/links/networkParams.js` (FR-248).

## Publisher account signup (step through with Simon)

Repo material read: `providers/local/partnerize/.grok/skills/a-search-partnerize-onboarding/SKILL.md` (**stub**: "Full agent-led onboarding ... is **UNKNOWN**"),
`providers/local/partnerize/.env.example` (`PARTNERIZE_PUBLISHER_ID`, `PARTNERIZE_FEED_URL`, `PARTNERIZE_API_KEY`, `PARTNERIZE_FEED_TOKEN`, `PARTNERIZE_API_TOKEN`), issues #637, #638, #1019 (FR-172).
Steps below are *(public docs, verify)* from help.phgsupport.com.

**Who signs up (same identity as Awin):**
- Contact email: `si@clubmadeira.uk`. This is the Awin publisher login from the Awin setup (publisher 2889699). Use it unless Simon picks another.
- Brand / site: **Club Madeira / Smart Catalogue**. Websites: `https://smartcatalogue.uk` (merchant/club catalogue, repo #1349) and `https://clubmadeira.io` (Club Madeira, madeiradb `ApiProvider` texts).
  The Awin Promotion URL (`AWIN_PROMOTION_URL`) is not set in the repo. **Simon confirms which URL is the primary property.**
- Legal company name, registered address, phone, VAT number, bank details: **not found in the repo. Simon provides them during signup.** Never write them into this file.
- Promotion description (adapt per form): "Club Madeira / Smart Catalogue: club and community websites (model clubs, sports and hobby clubs) get a product search widget; results deep-link to retailers with tracked affiliate links. UK audience, GBP." Promotion type: content/comparison, product search widget (not cashback, not voucher, no PPC brand bidding).

**Steps**
1. Open the sign-up tunnel `https://join.partnerize.com/partnerize` (or console.partnerize.com > Sign up). *(public docs, verify)*
2. Enter email, **username (can't be changed later; suggest "clubmadeira")**, password (8+ characters, mixed), country **United Kingdom**,
   company address and phone (**Simon**), vertical (Retail / Shopping), partner type **Content** (or comparison/technology), website, **company name** (Simon). Accept the T&Cs. *(public docs, verify)*
3. Verify the email (link sent to the signup inbox; Simon or the mailbox reader). *(public docs, verify)*
4. Log in. Partner details: logo, promotional country **GB**, description (above), website. *(public docs, verify)*
5. Payment and tax: Settings > Payment details (bank) and the tax/VAT section (**Simon**; self-billing invoices). *(public docs, verify)*
6. Our ids: the **Publisher ID** (Settings > Partner details, "Username / Publisher ID") goes in `publisherid`. Each approved campaign's **camref** (shown on its tracking links) goes on that affiliate folder. *(public docs, verify)*
7. API: Settings > **API credentials** shows the **user application key** and **user API key**. **Simon** enters them into `applicationkey` and `userapikey` by secure entry. *(public docs, verify)*
8. Join brands: Campaigns > **Join Campaigns** > search > select > agree to each programme's T&Cs > **Join Selected Campaigns**. Approval is at each brand's discretion (no fixed time). Message limit **UNKNOWN**: record it here. *(public docs, verify)*

**Where secrets go.** Never put them in this file or in a log.
- UI login: Simon creates `C:\passwords\partnerize.secret.txt` on redqueen (ACL SYSTEM + Administrators) in the Awin format: two CRLF lines, line 1 = email/username, line 2 = password. Agents never create, copy or print it.
- API keys/tokens: Simon enters them by secure entry into the `partnerize/` marker keys named below. The agent only checks that they are non-empty and never prints them.

**Marker keys:** not secret `publisherid`, `camref` (default); secret `username`, `password`, `applicationkey`, `userapikey`, `feedtoken`. Per affiliate: `affiliateid` = campaign id, plus `camref`.
**Deep link (repo `shared/links/networkParams.js`):** affiliate `camref`, tenant `pubref`: `https://prf.hn/click/camref:{camref}/pubref:{tenantid}/destination:{url}`.
**Feeds:** per-campaign product feeds (repo: the feed URL is the durable locator). Secrets appear in `feedurl` only as `{feedtoken}` / `{userapikey}`.

**Checklist**
- [ ] Account created, email verified, username recorded (not secret)
- [ ] Profile, website and GB promo country set
- [ ] Bank and tax/VAT done (Simon)
- [ ] `C:\passwords\partnerize.secret.txt` (Simon)
- [ ] `applicationkey` and `userapikey` set (Simon, secure entry); `publisherid` set
- [ ] First campaign approved, `camref` recorded, feed found and tested, `partnerize/{id}/` created
- [ ] Message limit recorded; `enabled=1` (Simon's go-ahead)

## Open: needs publisher account / credentials
- No Partnerize publisher account details are recorded in a-search, a-affiliates or madeiradb.
- Secret keys on `partnerize/` exist only as **empty** fields: `username`, `password`, `applicationkey`, `userapikey`, `feedtoken`. Simon adds them by secure entry;
  the UI login goes in `C:\passwords\partnerize.secret.txt` (Awin format). Never print them.
- Before any run: confirm the account, ids, sign-in/OTP behaviour, feed access and the message limit, then update this file.
- Until then the agent does nothing for this provider beyond reading this file.
