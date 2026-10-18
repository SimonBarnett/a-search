---
name: a-search-tradedoubler-onboarding
description: >
  FR #4155 publisher-account signup onboarding for tradedoubler (from
  s3://a-affiliates/tradedoubler/AGENT.md). Use in providers/local/tradedoubler or
  /a-search-tradedoubler-onboarding. Never commit secrets.
---

# a-search tradedoubler onboarding (publisher signup)

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake
>    (`Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search ...` or
>    `POST https://irc.ntsa.uk/bob/v1/intake`). Never leave a finding unfiled.
> 2. Harvest setup playbooks back into **this** skillbook.
> 3. Never put tokens, passwords, OTP codes, feed API keys, or partner keys in a
>    filing, skill, log, or commit.
> Never park a-search product lessons under bobiverse `harvest/SKILL.md`.

You are in **`providers/local/tradedoubler/`**. **Repo is the source** for publisher
signup steps (FR #4155). Bucket `s3://a-affiliates/tradedoubler/AGENT.md` should point
here; do not invent steps beyond AGENT.md / this skill.

## Source

Copied from `s3://a-affiliates/tradedoubler/AGENT.md` (pasted on a-search#4155 unblock
comment, 2026-10-18). Lines marked *(public docs, verify)* stay until a real
signup confirms them. **Invite/apply message limit: UNKNOWN** (Awin's 149-char
cap does not apply here) --- record the form limit at first join before sending.

## Signup URL

`https://publishers.tradedoubler.com/en/publishers/signup/`

## Identity (same as Awin unless Simon says otherwise)

- Contact email: `si@clubmadeira.uk` (Awin publisher login; publisher 2889699)
- Brand / site: Club Madeira / Smart Catalogue --- `https://smartcatalogue.uk`,
  `https://clubmadeira.io` (Simon confirms primary property)
- Legal company name, address, phone, VAT, bank: **Simon provides** --- never
  write into this skill
- Promotion type: content/comparison product-search widget (not cashback/voucher/PPC brand bidding)

## Secrets (never in this skill)

- UI login: Simon creates `C:\passwords\tradedoubler.secret.txt` on redqueen (ACL
  SYSTEM + Administrators), Awin format (two CRLF lines: email, password).
  Agents never create, copy, or print it.
- API keys: Simon secure-enters into provider-marker secret keys only.
- OTP, captcha, or SMS: **stop and ask Simon**. Outbound emails (e.g. Webgains
  site validation) need Simon's approval.

## Marker keys

- Not secret: publisherid, ouraffiliateid
- Secret: username, password, apitoken, apikey, feedtoken

## Deep link (must match `shared/links/networkParams.js`)

https://clk.tradedoubler.com/click?p={affiliateid}&a={ouraffiliateid}&epi={tenantid}&url={url} (epi2=click id)

## Publisher account signup (from AGENT.md)

## Publisher account signup (step through with Simon)



Repo material read: `providers/local/tradedoubler/.grok/skills/a-search-tradedoubler-onboarding/SKILL.md` (former stub (replaced by this skill)), `providers/local/tradedoubler/.env.example`

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

## After signup

1. Confirm ids on the `tradedoubler/` marker (non-secret) and secrets via secure entry.
2. Join programmes/brands per AGENTS.md section 9; record **message limit** here.
3. Create/merge `a-affiliates/tradedoubler/{affiliateid}/` folders (merge, never recreate).
4. Set `enabled=1` only after Simon's go-ahead and a verified feed.
