---
name: a-search-admitad-onboarding
description: >
  FR #4155 publisher-account signup onboarding for admitad (from
  s3://a-affiliates/admitad/AGENT.md). Use in providers/local/admitad or
  /a-search-admitad-onboarding. Never commit secrets.
---

# a-search admitad onboarding (publisher signup)

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake
>    (`Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search ...` or
>    `POST https://irc.ntsa.uk/bob/v1/intake`). Never leave a finding unfiled.
> 2. Harvest setup playbooks back into **this** skillbook.
> 3. Never put tokens, passwords, OTP codes, feed API keys, or partner keys in a
>    filing, skill, log, or commit.
> Never park a-search product lessons under bobiverse `harvest/SKILL.md`.

You are in **`providers/local/admitad/`**. **Repo is the source** for publisher
signup steps (FR #4155). Bucket `s3://a-affiliates/admitad/AGENT.md` should point
here; do not invent steps beyond AGENT.md / this skill.

## HOLD (FR-256)

**Do not sign up** until Simon lifts the hold. Stay dark: no invites, no folders, no enable work.

Registry stays **not enabled** (live + sandbox false) --- disabled stub path until the hold
lifts. Defer .env fill, sandbox enable, and endpoint **selftest** until Simon lifts HOLD.


## Source

Copied from `s3://a-affiliates/admitad/AGENT.md` (pasted on a-search#4155 unblock
comment, 2026-10-18). Lines marked *(public docs, verify)* stay until a real
signup confirms them. **Invite/apply message limit: UNKNOWN** (Awin's 149-char
cap does not apply here) --- record the form limit at first join before sending.

## Signup URL

`https://www.admitad.com/en/webmaster/`

## Identity (same as Awin unless Simon says otherwise)

- Contact email: `si@clubmadeira.uk` (Awin publisher login; publisher 2889699)
- Brand / site: Club Madeira / Smart Catalogue --- `https://smartcatalogue.uk`,
  `https://clubmadeira.io` (Simon confirms primary property)
- Legal company name, address, phone, VAT, bank: **Simon provides** --- never
  write into this skill
- Promotion type: content/comparison product-search widget (not cashback/voucher/PPC brand bidding)

## Secrets (never in this skill)

- UI login: Simon creates `C:\passwords\admitad.secret.txt` on redqueen (ACL
  SYSTEM + Administrators), Awin format (two CRLF lines: email, password).
  Agents never create, copy, or print it.
- API keys: Simon secure-enters into provider-marker secret keys only.
- OTP, captcha, or SMS: **stop and ask Simon**. Outbound emails (e.g. Webgains
  site validation) need Simon's approval.

## Marker keys

- Not secret: websiteid
- Secret: username, password, apitoken, clientid, clientsecret, feedtoken

## Deep link (must match `shared/links/networkParams.js`)

admitad_uid + tenant subid (partner subid1, click subid4; never subid3)

## Publisher account signup (from AGENT.md)

## On hold (FR-256): do not sign up until Simon lifts the hold



Repo: `providers/local/admitad/.grok/skills/a-search-admitad-onboarding/SKILL.md` (former stub (replaced by this skill)), `.env.example`, `docs/provider-shortlist.md` (GBP market hold), issue #1661.

Kept for later only. Lines are *(public docs, verify)*.



1. Signup: https://www.admitad.com/en/webmaster/ (publisher sign-up). *(public docs, verify)*

2. Use the same identity as the active networks (contact `si@clubmadeira.uk`, Club Madeira / Smart Catalogue, company details and tax/bank from **Simon**).

3. Expect email verification, site verification, a tax form (US networks: **W-8BEN-E**), bank details and manual review. *(public docs, verify)*

4. Ids: website id goes in `websiteid` (repo `ADMITAD_WEBSITE_ID`, link param `admitad_uid`). API: OAuth2 client id/secret (Account > API) go in `clientid`/`clientsecret`, entered by **Simon** via secure entry; UI login in `C:\passwords\admitad.secret.txt`.

5. Deep link (repo `networkParams.js`): tenant `subid` (partner `subid1`, click id `subid4`; **never `subid3`**).



**Checklist** (do nothing until the hold is lifted)

- [ ] Simon lifted the hold (record date and issue)

- [ ] Account created and verified; tax and bank done (Simon)

- [ ] Secrets in place (Simon); ids set; first programme and feed tested

## After signup

1. Confirm ids on the `admitad/` marker (non-secret) and secrets via secure entry.
2. Join programmes/brands per AGENTS.md section 9; record **message limit** here.
3. Create/merge `a-affiliates/admitad/{affiliateid}/` folders (merge, never recreate).
4. Set `enabled=1` only after Simon's go-ahead and a verified feed.
