# a-affiliates: generic agent instructions (all providers)

Location: `s3://a-affiliates/AGENTS.md` (on redqueen: `S:\a-affiliates\AGENTS.md`).
Specs: SimonBarnett/a-search #3999 (layout), #4108 (`download`), #4123 (`agent` + daily run), #4001 (redqueen import).

> Simon (2026-10-18 14:00 BST): "There should be a generic agents.md with affiliate instructions. The agent should read how affiliates work from S:\a-affiliates. Then the agent looks at the affilaite specific instructions in e.g. S:\a-affiliates\awin"

## 1. Read order

Load these four files, in this order, at the start of every run:

1. **This file** (`AGENTS.md`).
2. `SKILLS.md` in this folder: general skills harvested by every affiliate agent (section 13).
3. `{provider}/AGENT.md` (e.g. `S:\a-affiliates\awin\AGENT.md`).
4. `{provider}/SKILLS.md`: skills harvested by that provider's agent (section 13).

Then:

1. The provider file wins **only on provider-specific details**: URLs, ids, credential file, feed URL formats,
   message length limits, provider steps and playbooks. It never relaxes the rules here on secrets, write targets,
   merge-not-recreate or stop-and-ask.
2. A skill never overrides a rule in `AGENTS.md` or `{provider}/AGENT.md`. If a skill conflicts with them, follow the rule and fix the skill.
3. If `AGENTS.md` or `{provider}/AGENT.md` is missing, stop and report it. Don't guess. A missing `SKILLS.md` is not an error:
   create it with its heading at the first harvest (section 13).

## 2. What an affiliate is

Simon's taxonomy (#1349, 2026-10-10): an **AFFILIATE** is a source whose **parts we download** and which **pays us commission**.
- Outbound links carry **our affiliate id plus the tenant id**. The tenant is the 8-char id of the credited club for widget
  clicks, or the JWT `userId` for API search.
- Affiliates pay us, so there are **no Stripe fields** on any affiliate folder. (Merchants, who pay a subscription, live elsewhere.)

## 3. Providers

Affiliate networks (registry `class: affiliate` in `providers/registry.json`; link params in `shared/links/networkParams.js`):

| provider | folder | status | instructions |
|---|---|---|---|
| Awin | `awin/` | active: 244 advertiser folders, daily agent (#4123) | `awin/AGENT.md` |
| Impact | `impact/` | folder only, `enabled=0`, needs publisher account | `impact/AGENT.md` |
| Partnerize | `partnerize/` | folder only, `enabled=0`, needs publisher account | `partnerize/AGENT.md` |
| Webgains | `webgains/` | folder only, `enabled=0`, needs publisher account | `webgains/AGENT.md` |
| Tradedoubler | `tradedoubler/` | folder only, `enabled=0`, needs publisher account | `tradedoubler/AGENT.md` |
| Admitad | `admitad/` | **HOLD** (GBP market hold, FR-256), `enabled=0` | `admitad/AGENT.md` |
| FlexOffers | `flexoffers/` | **HOLD** (GBP market hold, FR-256), `enabled=0` | `flexoffers/AGENT.md` |
| AvantLink | `avantlink/` | **HOLD** (GBP market hold, FR-255), `enabled=0` | `avantlink/AGENT.md` |

A provider marker with `enabled=0` means: read its AGENT.md, but don't sign in, invite or create affiliate folders.
`hold=1` means stay dark until Simon lifts the hold.

**Not affiliates here (live-search providers, searched per query, no download):** Amazon, eBay, Etsy, Rakuten, CJ,
Kelkoo, Skimlinks, AliExpress, bol. Rakuten and CJ are affiliate networks, but a-search uses their live search APIs
(registry `class: provider`), so they have no folder here unless Simon decides to add a feed-download twin.
ShareASale is not a candidate (merged into Awin).

A new provider gets a lower-case slug folder, its own `AGENT.md` and a row here.

## 4. Bucket layout

```
a-affiliates/                         s3://a-affiliates (private, SSE-S3), mounted at S:\a-affiliates on redqueen
  AGENTS.md                           this file
  SKILLS.md                           general harvested skills (all providers), section 13
  _root/                              bucket-root config marker (S3 has no empty-key metadata): defaultage, etc.
  .grok/LESSONS.md                    RETIRED stub (merged into SKILLS.md 2026-10-18); never write here
  {provider}/                         provider folder marker: provider-level keys (login/API endpoints, ids, secrets, enabled)
  {provider}/AGENT.md                 provider-specific instructions (marker key instructions=AGENT.md)
  {provider}/SKILLS.md                provider-specific harvested skills, section 13
  {provider}/.grok/                   RETIRED stubs (merged into {provider}/SKILLS.md 2026-10-18); never write here
  {provider}/{affiliateid}/           affiliate folder marker: how to download that affiliate's feed
  {provider}/{affiliateid}/{yyyy-mm-dd}.{ext}   decompressed feed, written only by `download` / the download job;
                                      the DB import reads it and deletes it (no parts/, no latest, no backups)
  {provider}/_import/                  provider import instructions (config.json, IMPORT.md, sql/) for dbimport
  {provider}/_invite/                  provider invite entry (invite.mjs + config); distinct from _invites records
  {provider}/_invites/{id}/           invite record (section 9)
```

`{affiliateid}` is the provider's own id for the advertiser (for Awin, the advertiser id). Use the id exactly as the provider gives it.

### Root config (`_root/`)

| key | meaning |
|---|---|
| `defaultage` | Days since `lastdownload` before a merchant is due for refresh (currently `6`). Fallback when merchant and provider omit `defaultage`. |
| `kind` | `root` |
| `name` | `a-affiliates` |

### Provider keys (on `{provider}/`)

| key | meaning |
|---|---|
| `enabled` | `1` = active for `download` / agent invite-join work; `0` = dark (read AGENT.md only). Awin is `1`; other networks start at `0`. |
| `defaultage` | Optional override of root `defaultage` for every merchant under this provider |
| plus | login/API endpoints, publisher ids, secrets (see `{provider}/AGENT.md`) |

## 5. Folder markers

- Every folder is a **zero-byte object whose key ends in `/`**, written with `--server-side-encryption AES256`
  (content type `application/x-directory`). Its settings are **S3 user metadata** name/value pairs.
- Keys are lower-case. Values are **ASCII only**: fold accents (`ü`→`ue`, `é`→`e`) and drop any other non-ASCII.
- **Total metadata (keys + values) stays under 2 KB.** If more is needed, put it in a JSON object next to the marker.

### Affiliate keys (`{provider}/{affiliateid}/`)

| key | meaning | required |
|---|---|---|
| `affiliateid` | provider's advertiser id, the same as the folder name | always |
| `name` | display name (ASCII) | always |
| `format` | `csv` \| `tsv` \| `xml` \| `json` (what the network delivers; see `{provider}/AGENT.md` "Download format") | always |
| `compression` | `gzip` \| `zip` \| `none` (how the feed arrives; `download` always stores it decompressed) | always |
| `schedule` | `weekly` (default) | always |
| `enabled` | `1` only once the feed URL is verified to return data, else `0` | always |
| `disabledreason` | why `enabled=0`: `nofeed`, `notjoined`, `inactive`, `untested`, `feederror…` | when enabled=0 |
| `defaultage` | Optional days-since-`lastdownload` override for this merchant only (else provider, else `_root/` `defaultage`) | optional |
| `feedid` | provider feed id(s), comma-separated | when enabled=1 |
| `feedurl` | download URL in which every secret is a `{placeholder}` (e.g. `{feedapikey}`), filled from the provider folder at download time. Never the real secret. | when enabled=1 |
| `lastdownload`, `laststatus`, `lastsize`, `lastok` | **owned by the downloader** (`lastsize` = decompressed bytes, `lastok` = last successful download). Leave empty and never reset them | - |
| `lastmod` | ISO UTC time the marker was last written, e.g. `2026-10-18T12:00:00Z` | always |
| `logourl` | HTTPS URL of the advertiser's logo image (ASCII). **Required** on every enabled affiliate folder. Set by `onboard` from the provider API when present, else a deterministic public CDN URL for that network (Awin: `https://ui.awin.com/images/upload/merchant/profile/{id}.png`). Add on merge when missing; never overwrite a non-empty value. URL only — do not download image bytes into the folder | always (enabled=1) |
| optional | `joined`, `website`, `currency`, `sector`, `source` (`agent`/`madeiradb`/`onboard`), plus any link-building ids the provider file lists | - |


## 6. Merge, never recreate

- If `{provider}/{id}/` exists, **update it**:
  1. `aws s3api head-object --bucket a-affiliates --key {provider}/{id}/`
  2. Merge your keys into the existing metadata. Keep every key you aren't changing, and never touch the downloader's `last*` keys.
  3. `aws s3api copy-object --bucket a-affiliates --copy-source a-affiliates/{provider}/{id}/ --key {provider}/{id}/ --metadata-directive REPLACE --server-side-encryption AES256 --metadata file://merged.json`
- Only `put-object` (zero bytes, AES256) when head-object says the folder doesn't exist. Never create a second folder for the same id.
- **logourl on onboard (deterministic, tool-owned):** `onboard` **always** sets `logourl` (required on enabled folders). Prefer the provider's published logo URL (Awin: Publisher API `programmes[].logoUrl`, normalized to https); if that is missing, use the network's public profile CDN URL (Awin: `https://ui.awin.com/images/upload/merchant/profile/{id}.png`). When merging, add `logourl` only if absent or empty — never overwrite. Never download image bytes into the affiliate folder. If metadata would exceed 2 KB, put `logourl` in `{provider}/{id}/affiliate.json`. Count `logourlSet` / `logourlBackfilled` in the run report.
- **Straight after creating a new affiliate folder** (with `feedurl`, `format`, `compression` set and the feed tested), `cd S:\a-affiliates\{provider}\{affiliateid}`
  and run `download`, so the merchant's first data arrives on day 0. Put the result (`status`, `size`, file key) in the run report.
  After that only the daily download job refreshes the folder (FR pending); don't re-run `download` on later days unless asked.
- **Keep joined affiliates that have no product feed** (`enabled=0`, `disabledreason=nofeed`) — they may still provide
  discount coupons / offers. Missing from the Feed List alone is never a reason to delete.
- **Delete only when not joined.** When the provider joined API is available, `onboard` may delete prefixes whose id is
  absent from the joined set (left the programme). Without that API, do not delete from Feed List absence. Use
  `-SkipDeleteInactive` to leave all folders alone. Never write the dated feed files
  (`{provider}/{affiliateid}/{yyyy-mm-dd}.{ext}`) yourself, and never create a `parts/` folder.

## 7. Secrets

- Secrets live in exactly two places: the **provider folder's metadata keys** (e.g. `password`, `apitoken`, feed API keys),
  and the **ACL'd credential files in `C:\passwords\` on redqueen** (Simon supplies them by secure entry).
- Never print, log, echo or report a secret, or any URL that contains one. Show `***`, or the `{placeholder}` form.
- Never put a secret in S3 plaintext other than those provider keys: not in `AGENT.md`/`AGENTS.md`, affiliate folders,
  invite records, reports, issues, PRs or chat. Never create, copy, move or print files in `C:\passwords`.
- If a secret you need is missing, stop and ask Simon.

## 8. Write targets

- Write **only** to `a-affiliates`.
- **madeiradb** (walrus) is **SELECT only**, and only for one-off reseeding. Never write to it.
- Never write to the old madeira partner portal. Never touch `a-clubs` or any `madeira-*` bucket, Lambda, role or secret.

## 9. Invites and joins

- **Invite record:** after **each** successful invite, immediately write or merge the zero-byte marker
  `a-affiliates/{provider}/_invites/{id}/` with metadata `invitedat` (ISO UTC, latest), `firstinvitedat`,
  `invitecount`, `name`, `invitemsg` and `source` (`invite` for the scheduled job, or `agent`).
- **No re-invite within 90 days.** Skip using **`invitedat`** (not merely “`_invites/{id}/` exists”). Also skip anyone
  already joined or with an affiliate folder. Count `skipped90d` / foldered skips in the run report.
- **Messages are personalised per invitee.** Compose from that advertiser's scraped fields (name, sector/vertical, feed
  and approval signals). No LLM on the scheduled path; no single fixed string for every advertiser; no two advertisers
  get the same text in a run. Fit **the provider's own message length limit** in `{provider}/AGENT.md` (Awin: 149).
  Check length before submit; trim at a word boundary.
- **Scheduled invites (Awin):** run the deterministic `invite` tool (Playwright, Join Programmes / notJoined) — zero
  model tokens. OTP/captcha still stops for Simon.
- Respect the daily invite/join limits for the run.

## 10. Sign-in, OTP and captcha

- Sign in the way the provider file says, with a persistent browser profile so prompts stay rare.
- If you hit an **OTP challenge, a captcha, or any sign-in you can't get past, stop and notify Simon**, saying which step
  and which advertisers are affected. Never guess, never loop, never fail silently.
- Before submitting an OTP, tick any **trust this machine / remember this device** checkbox so the persistent profile
  skips MFA on later runs. Harvested sign-in skills live in `SKILLS.md` (general) and `{provider}/SKILLS.md`
  (section 13).

## 11. Tools (redqueen, on PATH, cwd under `S:\a-affiliates`)

| command | run from | does |
|---|---|---|
| `agent` | `S:\a-affiliates\{provider}` | the provider's agent run (also the daily scheduled run): loads `AGENTS.md`, `SKILLS.md`, `{provider}/AGENT.md` and `{provider}/SKILLS.md` (section 1), then creates folders for new affiliates, runs `download` in each new folder straight after creating it, sends invites, and harvests skills (section 13). `-WhatIf` = dry run |
| `onboard` | `S:\a-affiliates\{provider}` | find new platform signups from provider meta (Awin: Feed List / optional joined API, no MFA), create missing feed folders with **required** `logourl`, keep/create joined **nofeed** folders for coupon advertisers, run `download` on new feed folders, and **delete only not-joined** ids (joined API). Never delete solely for missing Feed List entry. `-SkipDeleteInactive` / `-WhatIf` |
| `dbimport` | `S:\a-affiliates` (root), `{provider}`, or `{provider}/{id}` | Import dated `{yyyy-mm-dd}.csv` + `.coupons.json` into `a_search` on `walrus\asearch`. Upsert Parts + AffiliateOffers; soft-delete missing from batch; delete files after success. Reads `{provider}/_import/`. `-WhatIf` dry-run. Enabled provider must have `_import/` (`import_not_implemented` otherwise). |
| `invite` | `S:\a-affiliates` (root) or `S:\a-affiliates\{provider}` | Root: every `enabled=1` provider. Provider folder when enabled. Loads `{provider}/_invite/` (Awin: Playwright invite.mjs). Missing `_invite` on enabled provider => `invite_not_implemented`. Default dry-run; `-Live` submits. Exit `2` = needs OTP. `_invites/{id}/` = invite *records* (90-day gate). |
| `download` | `S:\a-affiliates` (bucket root), `S:\a-affiliates\{provider}`, or `S:\a-affiliates\{provider}\{affiliateid}` | Product feed + (Awin) coupons. **Root:** every provider with `enabled=1`, then every merchant with `enabled=1` whose `lastdownload` is empty or older than resolved `defaultage` (merchant → provider → `_root/`). **Provider folder:** same merchant selection when that provider is `enabled=1` (else exit `provider_disabled`). **Affiliate folder:** that one merchant. `-All` ignores age (still skips disabled providers/merchants). `-Force` overwrites today's dated objects. `-WhatIf` dry-run. |
| `meta` | any folder | shows that folder marker's metadata (secrets masked) |
| `search` | folder tools | search folders (see `tools/README-folder-tools.md`) |

## 12. Runtime and run report

- Agent runtime: **Grok first, then Cursor** as the fallback.
- Only one run at a time. A second start exits with `already_running`.
- Every run ends with a **run report** (stdout and a local log on redqueen, not in this bucket). It lists invited, joined,
  approved, folders created, folders updated (including `logourl` backfills), folders deleted (inactive), first downloads (status and size per folder), invite skips (90-day/joined), no-feed follow-ups and `logourlSet` / `logourlBackfilled` counts.
  Counts and ids only, no secrets.
- After the run report, every run does the **skills harvest** (section 13), including dry runs and runs that stopped early
  (for example at an OTP).

## 13. Skills harvest

> Simon (2026-10-18 14:59 BST): "affiliate agents must harvest their skills to their affiliate folder
> General skills (like remember to click the trust this computer) should be written to the a-affiliate parent folder"

Skills are short, practical lessons the agents learn while running. They live in `SKILLS.md` files next to the
instructions and are loaded on every run (section 1):

| file | holds |
|---|---|
| `s3://a-affiliates/SKILLS.md` (`S:\a-affiliates\SKILLS.md`) | **general** skills: true for any affiliate network or any browser sign-in. Example: click "Trust this computer" at sign-in |
| `s3://a-affiliates/{provider}/SKILLS.md` (`S:\a-affiliates\{provider}\SKILLS.md`) | **provider-specific** skills: true only for that network's site, UI, limits or feeds |

**When to harvest**
- At the **end of every agent run**, after the run report, including dry runs and runs that stopped early.
- **Straight away** whenever the agent learns something worth keeping: a sign-in quirk, a UI step, a rate limit or pacing rule,
  a message pattern that worked or was rejected, a feed/download gotcha.

**How to write an entry**
1. **Decide the scope first.** Would it help an agent on a *different* network, or on any browser sign-in? Then it's
   **general** (root `SKILLS.md`). If it names this provider's URLs, screens, limits, ids or feeds, it's **provider-specific**
   (`{provider}/SKILLS.md`). If unsure, write it provider-specific.
2. **One entry = one bullet**, short and actionable (what to do, and when), under the right heading:
   `- YYYY-MM-DD: <what to do>. _Source: <agent/provider, run or issue>._`
   The date is the Europe/London date it was learned. The source line is the attribution.
3. **Merge and dedupe, never overwrite.** Read the current file, add your entry, and write the whole file back with every other
   entry kept. If the same skill is already there, don't add a copy: update that entry only if yours is more precise,
   and keep both sources on it. If an entry is wrong, mark it `(superseded YYYY-MM-DD: why)` and add the corrected one;
   never delete another agent's entry.
4. **Never write secrets** into a skill: no passwords, OTPs, API keys or tokens, feed keys or hashes, session cookies,
   or URLs that contain any of them. Use the `{placeholder}` form (e.g. `{feedapikey}`) and `{AWIN_PUBLISHER_ID}`-style names.
   No email bodies or personal data.
5. **Write only to the a-affiliates folders:** `s3://a-affiliates/SKILLS.md` and `s3://a-affiliates/{provider}/SKILLS.md`.
   Upload as `text/markdown; charset=utf-8` with `--sse AES256`. Never write skills to the repo, other buckets, other providers'
   folders or affiliate (`{provider}/{affiliateid}/`) folders.
6. A skill never relaxes a rule in `AGENTS.md` or `{provider}/AGENT.md`. If a lesson means a rule should change,
   report it to Simon in the run report instead of writing it as a skill.
7. Count the entries added or updated (general / provider) in the run report.

**Retired stores.** On 2026-10-18, `.grok/LESSONS.md` and `awin/.grok/` (`SKILLS-OVERVIEW.md`, `skills/README.md` and the nine
`skills/*/SKILL.md` playbooks) were merged into `SKILLS.md` and `awin/SKILLS.md`. Each merged entry's source line says which file
it came from (e.g. `(from .grok/LESSONS.md)`). Those paths now hold short "merged, do not write here" stubs and are **not**
references. New lessons go **only** to `SKILLS.md` / `{provider}/SKILLS.md`. Never write to any `.grok/` path in this bucket.
The full original playbook texts are in a-search #4123 comments 1/4 to 4/4.
