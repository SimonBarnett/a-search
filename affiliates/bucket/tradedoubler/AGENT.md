> **Read `../AGENTS.md` (`s3://a-affiliates/AGENTS.md`, `S:\a-affiliates\AGENTS.md`) first.** This file has only Tradedoubler-specific details.

# Tradedoubler provider: agent instructions

Location: `s3://a-affiliates/tradedoubler/AGENT.md`. Status: **provider folder only, `enabled=0`.** No affiliate folders yet
(madeiradb had no Tradedoubler sellers on 2026-10-18).
Repo source: providers/local/tradedoubler (registry class=affiliate, kind=local, enabled live+sandbox); shared/links/networkParams.js; .env.example (FR-090/091).

## Ids
- `{affiliateid}` = the Tradedoubler programme id. Folder: `tradedoubler/{affiliateid}/`.
- Our account ids (provider-marker keys, empty until set): `publisherid`, `ouraffiliateid`.

## URLs
- Login (UI): https://login.tradedoubler.com. API: https://connect.tradedoubler.com (authtype `token`). These come from public docs; verify them at enable.

## Join / sign-up flow
Apply to programmes in the Tradedoubler publisher UI (Programmes > Find/Apply). The repo's onboarding skill is a stub: credential steps are UNKNOWN.
Invite records and the 90-day rule follow AGENTS.md section 9. **Message limit: UNKNOWN.** Check the join form's limit at the
first join and record it here before sending.

## Feed / API format
Product feeds per programme (repo: `TRADEDOUBLER_FEED_URL`/`_API_KEY`/`_FEED_TOKEN`; the feed URL is the durable locator). Store `feedid` and `feedurl` with secrets as placeholders.
Default `format=csv`, `compression` as the feed URL says, `schedule=weekly`, `enabled=1` only after the feed is verified.

## Download format

**Not known yet** (the products API can return different formats): set `format`/`compression` on the marker once the first feed is tested.
- Supported on the markers: `format` = `csv` | `tsv` | `xml` | `json`; `compression` = `gzip` | `zip` | `none`. The affiliate marker wins; if it has no value the provider marker's `format`/`compression` is used.
- `download` decompresses the feed and writes exactly one file into the merchant folder: `{provider}/{affiliateid}/{yyyy-mm-dd}.{ext}` (ext = format). No `parts/` folder, no `latest` copy, no backups. The DB import reads the file and deletes it.
- An unknown `format` or `compression` stops the download (`unsupported_format` / `unsupported_compression`) and nothing is written. Fix the marker, then run `download` again.

## Deep link (our affiliate id + tenant id)
Repo params: our affiliate id `a`, programme `p`, tenant `epi` (click id `epi2`). Form: `https://clk.tradedoubler.com/click?p={programmeid}&a={ouraffiliateid}&epi={tenantid}&url={url-encoded product url}`.
Source: `shared/links/networkParams.js` (FR-248).

## Publisher account signup (step through with Simon)

Repo material read: `providers/local/tradedoubler/.grok/skills/a-search-tradedoubler-onboarding/SKILL.md` (**stub**, UNKNOWN), `providers/local/tradedoubler/.env.example`
(`TRADEDOUBLER_AFFILIATE_ID` for link param `a`, `TRADEDOUBLER_FEED_URL` / `_API_KEY` / `_FEED_TOKEN`, `TRADEDOUBLER_PUBLISHER_ID`, `TRADEDOUBLER_API_TOKEN`), issues #642, #643, #644, #1021 (FR-174).
Steps are *(public docs, verify)* from publishers.tradedoubler.com and dev.tradedoubler.com.

**Who signs up (same identity as Awin):**
- Contact email: `si@clubmadeira.uk`. This is the Awin publisher login from the Awin setup (publisher 2889699). Use it unless Simon picks another.
- Brand / site: **Club Madeira / Smart Catalogue**. Websites: `https://smartcatalogue.uk` (merchant/club catalogue, repo #1349) and `https://clubmadeira.io` (Club Madeira, madeiradb `ApiProvider` texts).
  The Awin Promotion URL (`AWIN_PROMOTION_URL`) is not set in the repo. **Simon confirms which URL is the primary property.**
- Legal company name, registered address, phone, VAT number, bank details: **not found in the repo. Simon provides them during signup.** Never write them into this file.
- Promotion description (adapt per form): "Club Madeira / Smart Catalogue: club and community websites (model clubs, sports and hobby clubs) get a product search widget; results deep-link to retailers with tracked affiliate links. UK audience, GBP." Promotion type: content/comparison, product search widget (not cashback, not voucher, no PPC brand bidding).

**Steps**
1. Open `https://publishers.tradedoubler.com/en/publishers/signup/` (country **United Kingdom**). Three steps: Credentials, Account Details, Website Details. *(public docs, verify)*
2. Credentials: username; password **7 to 20 characters, with at least 1 uppercase letter and 1 digit**. Account type **Company** (Simon confirms), company name, first/last name, email.
   The legacy form has a **"Control code" (captcha)**: **stop and ask Simon** to type it. Accept the Publisher Agreement. *(public docs, verify)*
3. Activate from the activation email. The login goes in `C:\passwords\tradedoubler.secret.txt` (**Simon**). *(public docs, verify)*
4. Add the website and **verify the site**: either the HTML comment tag in `<head>` (`<!--Tradedoubler site verification {siteid} -->`) or a `{siteid}.html` file at the site root, then **Verify Site**. **Simon or the site owner** uploads it. *(public docs, verify)*
5. Our ids: the publisher/organisation id goes in `publisherid`. The **site id** (shown on verification, and as `a=` in links) goes in `ouraffiliateid` (repo `TRADEDOUBLER_AFFILIATE_ID`). *(public docs, verify)*
6. Payment details, VAT and self-billing (**Simon**). *(public docs, verify)*
7. API token: Account > **Manage tokens**, system **PRODUCTS** (40-character hex). **Simon** stores it in `apitoken` by secure entry. *(public docs, verify)*
8. Apply to programmes (Programmes > Find > Apply); approval is per advertiser. Feeds: `GET https://api.tradedoubler.com/1.0/productFeeds?token={apitoken}`, then
   products `GET https://api.tradedoubler.com/1.0/products;fid={feedid}?token={apitoken}`. Keep the literal `{apitoken}` in `feedurl`. Message limit **UNKNOWN**. *(public docs, verify)*

**Where secrets go.** Never put them in this file or in a log.
- UI login: Simon creates `C:\passwords\tradedoubler.secret.txt` on redqueen (ACL SYSTEM + Administrators) in the Awin format: two CRLF lines, line 1 = email/username, line 2 = password. Agents never create, copy or print it.
- API keys/tokens: Simon enters them by secure entry into the `tradedoubler/` marker keys named below. The agent only checks that they are non-empty and never prints them.

**Marker keys:** not secret `publisherid`, `ouraffiliateid`; secret `username`, `password`, `apitoken`, `apikey`, `feedtoken`. Per affiliate: `affiliateid` = programme id (`p`).
**Deep link (repo):** `https://clk.tradedoubler.com/click?p={affiliateid}&a={ouraffiliateid}&epi={tenantid}&url={url}` (click id `epi2`).

**Checklist**
- [ ] Signup done (captcha typed by Simon), account activated, `C:\passwords\tradedoubler.secret.txt` (Simon)
- [ ] Site added and verified
- [ ] Bank, VAT and self-billing done (Simon)
- [ ] `publisherid` and `ouraffiliateid` set; PRODUCTS token in `apitoken` (Simon, secure entry)
- [ ] First programme approved, feed listed and tested, `tradedoubler/{id}/` created
- [ ] Message limit recorded; `enabled=1` (Simon's go-ahead)

## Open: needs publisher account / credentials
- No Tradedoubler publisher account details are recorded in a-search, a-affiliates or madeiradb.
- Secret keys on `tradedoubler/` exist only as **empty** fields: `username`, `password`, `apitoken`, `apikey`, `feedtoken`. Simon adds them by secure entry;
  the UI login goes in `C:\passwords\tradedoubler.secret.txt` (Awin format). Never print them.
- Before any run: confirm the account, ids, sign-in/OTP behaviour, feed access and the message limit, then update this file.
- Until then the agent does nothing for this provider beyond reading this file.
