---
name: a-search-impact-onboarding
description: >
  FR #4155 publisher-account signup onboarding for impact (from
  s3://a-affiliates/impact/AGENT.md). Use in providers/local/impact or
  /a-search-impact-onboarding. Never commit secrets.
---

# a-search impact onboarding (publisher signup)

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake
>    (`Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search ...` or
>    `POST https://irc.ntsa.uk/bob/v1/intake`). Never leave a finding unfiled.
> 2. Harvest setup playbooks back into **this** skillbook.
> 3. Never put tokens, passwords, OTP codes, feed API keys, or partner keys in a
>    filing, skill, log, or commit.
> Never park a-search product lessons under bobiverse `harvest/SKILL.md`.

You are in **`providers/local/impact/`**. **Repo is the source** for publisher
signup steps (FR #4155). Bucket `s3://a-affiliates/impact/AGENT.md` should point
here; do not invent steps beyond AGENT.md / this skill.

## Source

Copied from `s3://a-affiliates/impact/AGENT.md` (pasted on a-search#4155 unblock
comment, 2026-10-18). Lines marked *(public docs, verify)* stay until a real
signup confirms them. **Invite/apply message limit: UNKNOWN** (Awin's 149-char
cap does not apply here) --- record the form limit at first join before sending.

## Signup URL

`https://app.impact.com/signup`

## Identity (same as Awin unless Simon says otherwise)

- Contact email: `si@clubmadeira.uk` (Awin publisher login; publisher 2889699)
- Brand / site: Club Madeira / Smart Catalogue --- `https://smartcatalogue.uk`,
  `https://clubmadeira.io` (Simon confirms primary property)
- Legal company name, address, phone, VAT, bank: **Simon provides** --- never
  write into this skill
- Promotion type: content/comparison product-search widget (not cashback/voucher/PPC brand bidding)

## Secrets (never in this skill)

- UI login: Simon creates `C:\passwords\impact.secret.txt` on redqueen (ACL
  SYSTEM + Administrators), Awin format (two CRLF lines: email, password).
  Agents never create, copy, or print it.
- API keys: Simon secure-enters into provider-marker secret keys only.
- OTP, captcha, or SMS: **stop and ask Simon**. Outbound emails (e.g. Webgains
  site validation) need Simon's approval.

## Marker keys

- Not secret: mediapartnerid, trackinghost
- Secret: username, password, accountsid, authtoken

## Deep link (must match `shared/links/networkParams.js`)

https://{trackinghost}/c/{mediapartnerid}/{adid}/{campaignid}?u={url}&subId1={tenantid} (subId2=partner, subId3=click; campaign in path not subId1)

## MSSQL / ImpactPendingOnboard (superseded)

The old repo flow drained `dbo.ImpactPendingOnboard` (FR-051) and MSSQL Parts
config for local search. **Superseded by `a-affiliates`**: publisher signup and
affiliate folders live under `s3://a-affiliates/impact/`. Keep MSSQL Parts worker
config only if still needed for search; do not use pending-onboard for new joins.

## Publisher account signup (from AGENT.md)

## Publisher account signup (step through with Simon)



Repo material read: `providers/local/impact/.grok/skills/a-search-impact-onboarding/SKILL.md`, `providers/local/impact/onboarding/.grok/skills/a-search-impact-onboarding/SKILL.md`,

`providers/local/impact/.env.example`, `providers/local/impact/AGENTS.md`, `docs/onboarding-agents.md`, `docs/phase3-enable-provider.md`, issues #116, #162, #241.

The repo covers **campaign/MSSQL config and link params, not the network signup itself.** Repo text, verbatim from `providers/local/impact/.grok/skills/a-search-impact-onboarding/SKILL.md`:

> 1. Confirm Impact publisher / campaign access for the target marketplace.

> 3. Fill `.env` from `.env.example`; keep secrets out of IRC/chat/logs.

> 6. Feed **ingest** stays with maintainer ÔÇö this CWD does not download Impact CSV feeds.



That file's MSSQL / `dbo.ImpactPendingOnboard` steps are superseded by this bucket. Lines marked *(public docs, verify)* come from help.impact.com.



**Who signs up (same identity as Awin):**

- Contact email: `si@clubmadeira.uk`. This is the Awin publisher login from the Awin setup (publisher 2889699). Use it unless Simon picks another.

- Brand / site: **Club Madeira / Smart Catalogue**. Websites: `https://smartcatalogue.uk` (merchant/club catalogue, repo #1349) and `https://clubmadeira.io` (Club Madeira, madeiradb `ApiProvider` texts).

  The Awin Promotion URL (`AWIN_PROMOTION_URL`) is not set in the repo. **Simon confirms which URL is the primary property.**

- Legal company name, registered address, phone, VAT number, bank details: **not found in the repo. Simon provides them during signup.** Never write them into this file.

- Promotion description (adapt per form): "Club Madeira / Smart Catalogue: club and community websites (model clubs, sports and hobby clubs) get a product search widget; results deep-link to retailers with tracked affiliate links. UK audience, GBP." Promotion type: content/comparison, product search widget (not cashback, not voucher, no PPC brand bidding).



**Steps**

1. Open `https://app.impact.com/signup` (on the sign-in page choose **Partner**). Continue with **Email** (not Apple/Google, so the agent can sign in from the secrets file). *(public docs, verify)*

2. Enter email, first/last name, password and **mobile number**. **Simon** receives the **SMS verification code** and gives it to the agent (human step). *(public docs, verify)*

3. Account details: country **United Kingdom**, timezone Europe/London, currency **GBP** (this sets the payout currency), account name "Club Madeira". Accept the Partner Program Agreement. *(public docs, verify)*

4. Checklist, "Categorize your business": I am = content/comparison publisher; Operating as = **company** (Simon confirms); promotes primarily through = website; where = UK. *(public docs, verify)*

5. "Connect your channels": add the website property and **verify ownership** (meta tag, file or DNS). **Simon or the site owner** places the tag. *(public docs, verify)*

6. Personalize the profile (logo, description above) and submit the marketplace application. **Approval: decision within about 72 hours** (In Review, then Approved or Declined). *(public docs, verify)*

7. After approval, Finance: bank details (**Simon**). Tax: a non-US company working with US brands submits **W-8BEN-E** (**Simon**); payouts are blocked until it's approved. For UK-only brands, just confirm the indirect tax (VAT) number under Settings > Company Information. *(public docs, verify)*

8. If 2FA is asked for, it uses Simon's authenticator. OTP = stop and ask Simon, as for Awin.

9. Our ids: Settings > Account / API shows the **Account SID**. The media partner id appears in tracking links `/c/{mediapartnerid}/{adid}/{campaignid}`. *(public docs, verify)*

   Write `mediapartnerid` (not secret) to the `impact/` marker. `adid` and `campaignid` are per brand and go on each affiliate folder.

10. API: Settings > **API** (Account SID + Auth Token; read-only scope if offered). **Simon** enters them into `accountsid` and `authtoken` by secure entry. *(public docs, verify)*

11. Apply to brands: Brands > Marketplace / Discover > Apply. Write each message for that brand (AGENTS.md section 9). **Message limit UNKNOWN**: record it here at the first application.



**Where secrets go.** Never put them in this file or in a log.

- UI login: Simon creates `C:\passwords\impact.secret.txt` on redqueen (ACL SYSTEM + Administrators) in the Awin format: two CRLF lines, line 1 = email/username, line 2 = password. Agents never create, copy or print it.

- API keys/tokens: Simon enters them by secure entry into the `impact/` marker keys named below. The agent only checks that they are non-empty and never prints them.



**Marker keys:** not secret `mediapartnerid`, `trackinghost`; secret `username`, `password`, `accountsid`, `authtoken`. Per affiliate: `affiliateid` = brand/campaign id, `adid`, `campaignid`.

**Deep link (repo `shared/links/networkParams.js`, FR-248):** `https://{trackinghost}/c/{mediapartnerid}/{adid}/{campaignid}?u={url}&subId1={tenantid}` (subId2 = partner, subId3 = click id). The campaign goes in the path, never in subId1.

**Feeds:** Catalogs API `{apibase}/Mediapartners/{accountsid}/Catalogs` and `.../Catalogs/{id}/Items`, Basic auth SID:Token. *(public docs, verify)*



**Checklist** (mark `[x]` and update `lastmod` when each step is done)

- [ ] Account created (email login), phone verified

- [ ] Website property added and verified

- [ ] Marketplace application approved

- [ ] Bank details, W-8BEN-E / VAT done (Simon)

- [ ] `C:\passwords\impact.secret.txt` in place (Simon)

- [ ] `accountsid` and `authtoken` set on `impact/` (Simon, secure entry)

- [ ] `mediapartnerid` and `trackinghost` set on `impact/`

- [ ] First brand approved, catalog found, `impact/{id}/` folder created (merge rules), feed tested

- [ ] Message limit recorded; `enabled=1` on `impact/` (Simon's go-ahead)

## After signup

1. Confirm ids on the `impact/` marker (non-secret) and secrets via secure entry.
2. Join programmes/brands per AGENTS.md section 9; record **message limit** here.
3. Create/merge `a-affiliates/impact/{affiliateid}/` folders (merge, never recreate).
4. Set `enabled=1` only after Simon's go-ahead and a verified feed.
