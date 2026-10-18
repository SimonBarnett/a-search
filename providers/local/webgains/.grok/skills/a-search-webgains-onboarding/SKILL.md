---
name: a-search-webgains-onboarding
description: >
  FR #4155 publisher-account signup onboarding for webgains (from
  s3://a-affiliates/webgains/AGENT.md). Use in providers/local/webgains or
  /a-search-webgains-onboarding. Never commit secrets.
---

# a-search webgains onboarding (publisher signup)

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake
>    (`Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search ...` or
>    `POST https://irc.ntsa.uk/bob/v1/intake`). Never leave a finding unfiled.
> 2. Harvest setup playbooks back into **this** skillbook.
> 3. Never put tokens, passwords, OTP codes, feed API keys, or partner keys in a
>    filing, skill, log, or commit.
> Never park a-search product lessons under bobiverse `harvest/SKILL.md`.

You are in **`providers/local/webgains/`**. **Repo is the source** for publisher
signup steps (FR #4155). Bucket `s3://a-affiliates/webgains/AGENT.md` should point
here; do not invent steps beyond AGENT.md / this skill.

## Source

Copied from `s3://a-affiliates/webgains/AGENT.md` (pasted on a-search#4155 unblock
comment, 2026-10-18). Lines marked *(public docs, verify)* stay until a real
signup confirms them. **Invite/apply message limit: UNKNOWN** (Awin's 149-char
cap does not apply here) --- record the form limit at first join before sending.

## Signup URL

`https://platform.webgains.io/publisher/sign-up?locale=en-GB`

## Identity (same as Awin unless Simon says otherwise)

- Contact email: `si@clubmadeira.uk` (Awin publisher login; publisher 2889699)
- Brand / site: Club Madeira / Smart Catalogue --- `https://smartcatalogue.uk`,
  `https://clubmadeira.io` (Simon confirms primary property)
- Legal company name, address, phone, VAT, bank: **Simon provides** --- never
  write into this skill
- Promotion type: content/comparison product-search widget (not cashback/voucher/PPC brand bidding)

## Secrets (never in this skill)

- UI login: Simon creates `C:\passwords\webgains.secret.txt` on redqueen (ACL
  SYSTEM + Administrators), Awin format (two CRLF lines: email, password).
  Agents never create, copy, or print it.
- API keys: Simon secure-enters into provider-marker secret keys only.
- OTP, captcha, or SMS: **stop and ask Simon**. Outbound emails (e.g. Webgains
  site validation) need Simon's approval.

## Marker keys

- Not secret: publisherid, campaignid
- Secret: username, password, apitoken, apikey, feedtoken

## Deep link (must match `shared/links/networkParams.js`)

https://track.webgains.com/click.html?wgcampaignid={campaignid}&wgprogramid={affiliateid}&clickref={tenantid}&wgtarget={url}

## Publisher account signup (from AGENT.md)

## Publisher account signup (step through with Simon)



Repo material read: `providers/local/webgains/.grok/skills/a-search-webgains-onboarding/SKILL.md` (former stub (replaced by this skill)), `providers/local/webgains/.grok/skills/a-search-webgains/SKILL.md`

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

## After signup

1. Confirm ids on the `webgains/` marker (non-secret) and secrets via secure entry.
2. Join programmes/brands per AGENTS.md section 9; record **message limit** here.
3. Create/merge `a-affiliates/webgains/{affiliateid}/` folders (merge, never recreate).
4. Set `enabled=1` only after Simon's go-ahead and a verified feed.
