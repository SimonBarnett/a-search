> **Read `../AGENTS.md` (`s3://a-affiliates/AGENTS.md`, `S:\a-affiliates\AGENTS.md`) first.** This file has only Webgains-specific details.

# Webgains provider: agent instructions

Location: `s3://a-affiliates/webgains/AGENT.md`. Status: **provider folder only, `enabled=0`.** No affiliate folders yet
(madeiradb had no Webgains sellers on 2026-10-18).
Repo source: providers/local/webgains (registry class=affiliate, kind=local, enabled live+sandbox); shared/links/networkParams.js; .env.example (FR-087/088).

## Ids
- `{affiliateid}` = the Webgains programme id. Folder: `webgains/{affiliateid}/`.
- Our account ids (provider-marker keys, empty until set): `publisherid`, `campaignid`.

## URLs
- Login (UI): https://platform.webgains.com/login. API: https://platform-api.webgains.com (authtype `token`). These come from public docs; verify them at enable.

## Join / sign-up flow
Join advertiser programmes in the Webgains publisher platform (Programmes > Join). The repo's onboarding skill is a stub: credential steps are UNKNOWN.
Invite records and the 90-day rule follow AGENTS.md section 9. **Message limit: UNKNOWN.** Check the join form's limit at the
first join and record it here before sending.

## Feed / API format
Product feeds per programme (repo: `WEBGAINS_FEED_URL`/`_API_KEY`/`_FEED_TOKEN`; the feed URL is the durable locator). Store `feedid` and `feedurl` with secrets as placeholders.
Default `format=csv`, `compression` as the feed URL says, `schedule=weekly`, `enabled=1` only after the feed is verified.

## Download format

**Partly known:** Webgains lets you pick **CSV, XML or TSV** per programme (Product Feeds); compression depends on the feed URL options. Prefer CSV and set `format`/`compression` on the marker to match the URL you saved.
- Supported on the markers: `format` = `csv` | `tsv` | `xml` | `json`; `compression` = `gzip` | `zip` | `none`. The affiliate marker wins; if it has no value the provider marker's `format`/`compression` is used.
- `download` decompresses the feed and writes exactly one file into the merchant folder: `{provider}/{affiliateid}/{yyyy-mm-dd}.{ext}` (ext = format). No `parts/` folder, no `latest` copy, no backups. The DB import reads the file and deletes it.
- An unknown `format` or `compression` stops the download (`unsupported_format` / `unsupported_compression`) and nothing is written. Fix the marker, then run `download` again.

## Deep link (our affiliate id + tenant id)
Repo params: affiliate `wgcampaignid` (our campaign id), tenant `clickref`. Form: `https://track.webgains.com/click.html?wgcampaignid={campaignid}&wgprogramid={affiliateid}&clickref={tenantid}&wgtarget={url-encoded product url}`.
Source: `shared/links/networkParams.js` (FR-248).

## Publisher account signup (step through with Simon)

Repo material read: `providers/local/webgains/.grok/skills/a-search-webgains-onboarding/SKILL.md` (**stub**, UNKNOWN), `providers/local/webgains/.grok/skills/a-search-webgains/SKILL.md`
(it names `WEBGAINS_CAMPAIGN_ID` / `wgcampaignid`, `WEBGAINS_FEED_URL`, `WEBGAINS_API_KEY` or `WEBGAINS_FEED_TOKEN`, `WEBGAINS_PUBLISHER_ID`, `WEBGAINS_API_TOKEN`),
`.env.example`, `AGENTS.md`, issues #639, #640, #641, #1020 (FR-173). Steps are *(public docs, verify)* from knowledgehub.webgains.com.

**Who signs up (same identity as Awin):**
- Contact email: `si@clubmadeira.uk`. This is the Awin publisher login from the Awin setup (publisher 2889699). Use it unless Simon picks another.
- Brand / site: **Club Madeira / Smart Catalogue**. Websites: `https://smartcatalogue.uk` (merchant/club catalogue, repo #1349) and `https://clubmadeira.io` (Club Madeira, madeiradb `ApiProvider` texts).
  The Awin Promotion URL (`AWIN_PROMOTION_URL`) is not set in the repo. **Simon confirms which URL is the primary property.**
- Legal company name, registered address, phone, VAT number, bank details: **not found in the repo. Simon provides them during signup.** Never write them into this file.
- Promotion description (adapt per form): "Club Madeira / Smart Catalogue: club and community websites (model clubs, sports and hobby clubs) get a product search widget; results deep-link to retailers with tracked affiliate links. UK audience, GBP." Promotion type: content/comparison, product search widget (not cashback, not voucher, no PPC brand bidding).

**Steps**
1. Open `https://platform.webgains.io/publisher/sign-up?locale=en-GB`. Account type **Company** (Simon confirms); audience country **United Kingdom**. *(public docs, verify)*
2. Fill in company and contact details, website, promotion methods and traffic description. The site must be public and relevant, and must **display valid contact details** (check that smartcatalogue.uk does). *(public docs, verify)*
3. Wait for review (**no fixed approval time published**). On approval an **activation email** arrives: click it and set the password, which goes in `C:\passwords\webgains.secret.txt` (**Simon**). *(public docs, verify)*
4. **Site validation (manual):** place the Webgains text code on the site, then email `publisherteam@webgains.com` with the URL. **That email is an external send: Simon approves it or sends it himself.** After the confirmation email, remove the code. *(public docs, verify)*
5. Publisher Account > Account Info: the **Affiliate ID** goes in `publisherid`. Sites tab: the **Site/Campaign ID** (`wgcampaignid`) goes in `campaignid`. Networks tab: sign the UK network T&Cs, DPA and **self-billing** agreement (**Simon**). *(public docs, verify)*
6. Payment and VAT details (**Simon**). *(public docs, verify)*
7. API: account/developer settings > **Personal Access Tokens** > Generate. **Simon** stores it in `apitoken` by secure entry. *(public docs, verify)*
8. Join programmes in the platform (programme > Join); the API can also request membership. Feeds: Product Feeds > programme > CSV/XML/TSV > copy the URL into `feedurl` with secrets as placeholders. Message limit **UNKNOWN**. *(public docs, verify)*

**Where secrets go.** Never put them in this file or in a log.
- UI login: Simon creates `C:\passwords\webgains.secret.txt` on redqueen (ACL SYSTEM + Administrators) in the Awin format: two CRLF lines, line 1 = email/username, line 2 = password. Agents never create, copy or print it.
- API keys/tokens: Simon enters them by secure entry into the `webgains/` marker keys named below. The agent only checks that they are non-empty and never prints them.

**Marker keys:** not secret `publisherid`, `campaignid`; secret `username`, `password`, `apitoken`, `apikey`, `feedtoken`. Per affiliate: `affiliateid` = programme id.
**Deep link (repo):** affiliate `wgcampaignid`, tenant `clickref`: `https://track.webgains.com/click.html?wgcampaignid={campaignid}&wgprogramid={affiliateid}&clickref={tenantid}&wgtarget={url}`.
**Feeds:** Google Shopping format (UK mandatory fields: id, title, description, link, image_link, availability, price, google_product_category, shipping). *(public docs, verify)*

**Checklist**
- [ ] Application submitted (Company, UK)
- [ ] Activation email clicked, password set, `C:\passwords\webgains.secret.txt` (Simon)
- [ ] Site validation code placed, email sent (Simon approves), validated, code removed
- [ ] UK network T&Cs, DPA and self-billing signed; bank and VAT done (Simon)
- [ ] `publisherid` and `campaignid` set; `apitoken` set (Simon, secure entry)
- [ ] First programme joined, feed URL saved and tested, `webgains/{id}/` created
- [ ] Message limit recorded; `enabled=1` (Simon's go-ahead)

## Open: needs publisher account / credentials
- No Webgains publisher account details are recorded in a-search, a-affiliates or madeiradb.
- Secret keys on `webgains/` exist only as **empty** fields: `username`, `password`, `apitoken`, `apikey`, `feedtoken`. Simon adds them by secure entry;
  the UI login goes in `C:\passwords\webgains.secret.txt` (Awin format). Never print them.
- Before any run: confirm the account, ids, sign-in/OTP behaviour, feed access and the message limit, then update this file.
- Until then the agent does nothing for this provider beyond reading this file.
