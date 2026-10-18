---
name: a-search-partnerize-onboarding
description: >
  FR #4155 publisher-account signup onboarding for partnerize (from
  s3://a-affiliates/partnerize/AGENT.md). Use in providers/local/partnerize or
  /a-search-partnerize-onboarding. Never commit secrets.
---

# a-search partnerize onboarding (publisher signup)

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake
>    (`Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search ...` or
>    `POST https://irc.ntsa.uk/bob/v1/intake`). Never leave a finding unfiled.
> 2. Harvest setup playbooks back into **this** skillbook.
> 3. Never put tokens, passwords, OTP codes, feed API keys, or partner keys in a
>    filing, skill, log, or commit.
> Never park a-search product lessons under bobiverse `harvest/SKILL.md`.

You are in **`providers/local/partnerize/`**. **Repo is the source** for publisher
signup steps (FR #4155). Bucket `s3://a-affiliates/partnerize/AGENT.md` should point
here; do not invent steps beyond AGENT.md / this skill.

## Source

Copied from `s3://a-affiliates/partnerize/AGENT.md` (pasted on a-search#4155 unblock
comment, 2026-10-18). Lines marked *(public docs, verify)* stay until a real
signup confirms them. **Invite/apply message limit: UNKNOWN** (Awin's 149-char
cap does not apply here) --- record the form limit at first join before sending.

## Signup URL

`https://join.partnerize.com/partnerize`

## Identity (same as Awin unless Simon says otherwise)

- Contact email: `si@clubmadeira.uk` (Awin publisher login; publisher 2889699)
- Brand / site: Club Madeira / Smart Catalogue --- `https://smartcatalogue.uk`,
  `https://clubmadeira.io` (Simon confirms primary property)
- Legal company name, address, phone, VAT, bank: **Simon provides** --- never
  write into this skill
- Promotion type: content/comparison product-search widget (not cashback/voucher/PPC brand bidding)

## Secrets (never in this skill)

- UI login: Simon creates `C:\passwords\partnerize.secret.txt` on redqueen (ACL
  SYSTEM + Administrators), Awin format (two CRLF lines: email, password).
  Agents never create, copy, or print it.
- API keys: Simon secure-enters into provider-marker secret keys only.
- OTP, captcha, or SMS: **stop and ask Simon**. Outbound emails (e.g. Webgains
  site validation) need Simon's approval.

## Marker keys

- Not secret: publisherid, camref
- Secret: username, password, applicationkey, userapikey, feedtoken

## Deep link (must match `shared/links/networkParams.js`)

https://prf.hn/click/camref:{camref}/pubref:{tenantid}/destination:{url}

## Publisher account signup (from AGENT.md)

## Publisher account signup (step through with Simon)



Repo material read: `providers/local/partnerize/.grok/skills/a-search-partnerize-onboarding/SKILL.md` (former stub; replaced by this skill),

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

## After signup

1. Confirm ids on the `partnerize/` marker (non-secret) and secrets via secure entry.
2. Join programmes/brands per AGENTS.md section 9; record **message limit** here.
3. Create/merge `a-affiliates/partnerize/{affiliateid}/` folders (merge, never recreate).
4. Set `enabled=1` only after Simon's go-ahead and a verified feed.
