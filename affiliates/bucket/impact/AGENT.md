> **Read `../AGENTS.md` (`s3://a-affiliates/AGENTS.md`, `S:\a-affiliates\AGENTS.md`) first.** This file has only Impact-specific details.

# Impact provider: agent instructions

Location: `s3://a-affiliates/impact/AGENT.md`. Status: **provider folder only, `enabled=0`.** Partner account exists (`si@clubmadeira.uk` / Club Madeira); **Marketplace application = Declined** (2026-10-18). No affiliate folders yet (madeiradb had no Impact sellers on 2026-10-18).
Repo source: providers/local/impact (registry class=affiliate, kind=local, enabled live+sandbox); shared/links/networkParams.js; .env.example; .grok/skills/a-search-impact-onboarding; onboarding/ (FR-051 drain).
lastmod: 2026-10-18T15:10:00Z

## Ids
- `{affiliateid}` = the Impact brand/campaign id. Folder: `impact/{affiliateid}/`.
- Our account ids (provider-marker keys, empty until set): `mediapartnerid`, `adid`, `campaignid`, `trackinghost`.
- Affiliate folder meta: include `logourl` (HTTPS brand logo URL from Impact) on create / onboard; add when missing on merge (AGENTS.md). URL only — no image-byte download.

## URLs
- Login (UI): https://app.impact.com/login.user. Partner signup: from that page choose **Partner**, then **Continue with Email** (`https://app.impact.com/signup` 404s). API: https://api.impact.com (authtype `basic`). *(public docs, verify at enable)*

## Join / sign-up flow
**Marketplace Declined (2026-10-18):** Discover → Brands / Marketplace → Apply is **blocked** until marketplace access is restored (appeal via support, or reapply after strengthening the profile). While Declined, join brands only via **brand unique sign-up links** and **invitations** to brand programmes. That does not block existing or pending brand relationships.
When marketplace is Approved again: join via Brands > Discover/Marketplace > Apply. The repo marks the join **write API UNKNOWN**, so joins go through the UI. The old repo flow drained `dbo.ImpactPendingOnboard` (FR-051); that MSSQL path is replaced by this bucket.
Invite records and the 90-day rule follow AGENTS.md section 9. **Message limit: UNKNOWN.** Check the join form's limit at the
first join and record it here before sending.

## Feed / API format
Catalog feeds (CSV) per brand, listed through the Mediapartners Catalogs API (`{apibase}/Mediapartners/{accountsid}/Catalogs`, `.../Catalogs/{id}/Items`; Basic auth AccountSID:AuthToken). Store `feedid` = catalog id. Put secrets in `feedurl` only as `{accountsid}`/`{authtoken}` placeholders.
Default `format=csv`, `compression` as the feed URL says, `schedule=weekly`, `enabled=1` only after the feed is verified.

## Download format

**Partly known:** Impact catalogs are **CSV** per brand (Catalogs API, see above); compression **not confirmed**. Set `format=csv` and set `compression` on the marker to what the catalog download actually returns (`gzip`, `zip` or `none`).
- Supported on the markers: `format` = `csv` | `tsv` | `xml` | `json`; `compression` = `gzip` | `zip` | `none`. The affiliate marker wins; if it has no value the provider marker's `format`/`compression` is used.
- `download` decompresses the feed and writes exactly one file into the merchant folder: `{provider}/{affiliateid}/{yyyy-mm-dd}.{ext}` (ext = format). No `parts/` folder, no `latest` copy, no backups. The DB import reads the file and deletes it.
- An unknown `format` or `compression` stops the download (`unsupported_format` / `unsupported_compression`) and nothing is written. Fix the marker, then run `download` again.

## Deep link (our affiliate id + tenant id)
Tracking path `https://{trackinghost}/c/{mediapartnerid}/{adid}/{campaignid}?u={url-encoded product url}&subId1={tenantid}` (subId2 = partner, subId3 = click id). The campaign id goes in the path, **not** subId1 (FR-248).
Source: `shared/links/networkParams.js` (FR-248).

## Publisher account signup (step through with Simon)

Repo material read: `providers/local/impact/.grok/skills/a-search-impact-onboarding/SKILL.md`, `providers/local/impact/onboarding/.grok/skills/a-search-impact-onboarding/SKILL.md`,
`providers/local/impact/.env.example`, `providers/local/impact/AGENTS.md`, `docs/onboarding-agents.md`, `docs/phase3-enable-provider.md`, issues #116, #162, #241.
The repo covers **campaign/MSSQL config and link params, not the network signup itself.** Repo text, verbatim from `providers/local/impact/.grok/skills/a-search-impact-onboarding/SKILL.md`:
> 1. Confirm Impact publisher / campaign access for the target marketplace.
> 3. Fill `.env` from `.env.example`; keep secrets out of IRC/chat/logs.
> 6. Feed **ingest** stays with maintainer — this CWD does not download Impact CSV feeds.

That file's MSSQL / `dbo.ImpactPendingOnboard` steps are superseded by this bucket. Lines marked *(public docs, verify)* come from help.impact.com.

**Who signs up (same identity as Awin):**
- Contact email: `si@clubmadeira.uk`. This is the Awin publisher login from the Awin setup (publisher 2889699). Use it unless Simon picks another.
- Brand / site: **Club Madeira / Smart Catalogue**. Websites: `https://smartcatalogue.uk` (merchant/club catalogue, repo #1349) and `https://clubmadeira.io` (Club Madeira, madeiradb `ApiProvider` texts).
  **Primary property (Simon, 2026-10-18): `https://smartcatalogue.uk`.**
- Operating as: **company** (Simon, 2026-10-18).
- Legal company name, registered address, phone, VAT number, bank details: **not found in the repo. Simon provides them during signup.** Never write them into this file.
- Promotion description (adapt per form): "Club Madeira / Smart Catalogue: club and community websites (model clubs, sports and hobby clubs) get a product search widget; results deep-link to retailers with tracked affiliate links. UK audience, GBP." Promotion type: content/comparison, product search widget (not cashback, not voucher, no PPC brand bidding).

**Steps**
1. Open `https://app.impact.com/login.user`, choose **Partner**, then **Continue with Email** (not Apple/Google, so the agent can sign in from the secrets file). Do **not** use `https://app.impact.com/signup` (404 as of 2026-10-18). *(public docs, verify)*
2. Enter email, first/last name, password and **mobile number**. **Simon** receives the **SMS verification code** and gives it to the agent (human step). *(public docs, verify)*
3. Account details: country **United Kingdom**, timezone Europe/London, currency **GBP** (this sets the payout currency), account name "Club Madeira". Accept the Partner Program Agreement. *(public docs, verify)*
4. Checklist, "Categorize your business": I am = content/comparison publisher; Operating as = **company**; promotes primarily through = website; where = UK. *(public docs, verify)*
5. "Connect your channels": add the website property and **verify ownership** (meta tag, file or DNS). **Simon or the site owner** places the tag. *(public docs, verify)*
6. Personalize the profile (logo, description above) and submit the marketplace application. **Approval: decision within about 72 hours** (In Review, then Approved or Declined). *(public docs, verify)*
   **2026-10-18 outcome: Declined** ("You currently do not qualify for access to impact.com's Marketplace"). Common return reasons (help.impact.com): incomplete information; media property concerns; limited reach or activity; MPA violations. Appeal: contact support (or a PDM) after strengthening company info, verified properties and public profile. Direct brand links/invites still work while Declined.
7. Finance (can start before marketplace approval): bank details (**Simon**). Tax: a non-US company working with US brands submits **W-8BEN-E** (**Simon**); payouts are blocked until it's approved. For UK-only brands, just confirm the indirect tax (VAT) number under Settings > Company Information. *(public docs, verify)*
8. If 2FA is asked for, it uses Simon's authenticator. OTP = stop and ask Simon, as for Awin.
9. Our ids: Settings > Account / API shows the **Account SID**. The media partner id appears in tracking links `/c/{mediapartnerid}/{adid}/{campaignid}`. *(public docs, verify)*
   Write `mediapartnerid` (not secret) to the `impact/` marker. `adid` and `campaignid` are per brand and go on each affiliate folder.
10. API: Settings > **API** (Account SID + Auth Token; read-only scope if offered). **Simon** enters them into `accountsid` and `authtoken` by secure entry. *(public docs, verify)*
11. Apply to brands: only when Marketplace is **Approved** — Brands > Marketplace / Discover > Apply. While Declined, use brand unique sign-up links / invitations only. Write each message for that brand (AGENTS.md section 9). **Message limit UNKNOWN**: record it here at the first application.

**Where secrets go.** Never put them in this file or in a log.
- UI login: `C:\passwords\impact.txt` on redqueen (ACL SYSTEM + Administrators), Awin-style two CRLF lines: line 1 = email/username, line 2 = password. (Filename is `impact.txt`, not `impact.secret.txt`.) Agents never create, copy or print it.
- API keys/tokens: Simon enters them by secure entry into the `impact/` marker keys named below. The agent only checks that they are non-empty and never prints them.

**Marker keys:** not secret `mediapartnerid`, `trackinghost`; secret `username`, `password`, `accountsid`, `authtoken`. Per affiliate: `affiliateid` = brand/campaign id, `adid`, `campaignid`.
**Deep link (repo `shared/links/networkParams.js`, FR-248):** `https://{trackinghost}/c/{mediapartnerid}/{adid}/{campaignid}?u={url}&subId1={tenantid}` (subId2 = partner, subId3 = click id). The campaign goes in the path, never in subId1.
**Feeds:** Catalogs API `{apibase}/Mediapartners/{accountsid}/Catalogs` and `.../Catalogs/{id}/Items`, Basic auth SID:Token. *(public docs, verify)*

**Checklist** (mark `[x]` and update `lastmod` when each step is done)
- [x] Account created (email login), phone verified (2026-10-18)
- [ ] Website property added and verified (`https://smartcatalogue.uk` primary)
- [ ] Marketplace application approved — **Declined 2026-10-18**; strengthen profile then appeal via support
- [ ] Bank details, W-8BEN-E / VAT done (Simon)
- [x] `C:\passwords\impact.txt` in place (Simon, 2026-10-18; exists on redqueen)
- [ ] `accountsid` and `authtoken` set on `impact/` (Simon, secure entry)
- [ ] `mediapartnerid` and `trackinghost` set on `impact/`
- [ ] First brand approved, catalog found, `impact/{id}/` folder created (merge rules), feed tested
- [ ] Message limit recorded; `enabled=1` on `impact/` (Simon's go-ahead)

## Open: needs publisher account / credentials
- Partner account exists; Marketplace **Declined** (2026-10-18). Keep `enabled=0` until marketplace access or a workable direct-brand path is confirmed.
- Secret keys on `impact/` exist only as **empty** fields: `username`, `password`, `accountsid`, `authtoken`. Simon adds them by secure entry;
  the UI login is in `C:\passwords\impact.txt` (Awin format). Never print them.
- Before any run: confirm the account, ids, sign-in/OTP behaviour, feed access, marketplace status and the message limit, then update this file.
- Until marketplace is Approved (or Simon authorises direct-invite-only joins), the agent does not Discover/Apply brands for this provider.
