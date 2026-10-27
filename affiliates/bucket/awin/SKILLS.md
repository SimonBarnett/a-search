# Awin: provider skills (awin/)

Location: `s3://a-affiliates/awin/SKILLS.md` (`S:\a-affiliates\awin\SKILLS.md`). Rules: `../AGENTS.md` section 13 "Skills harvest".
Load order: `../AGENTS.md`, then `../SKILLS.md`, then `awin/AGENT.md`, then **this file**.

Only skills specific to Awin go here (its URLs, screens, limits, ids, feeds). General skills go in `../SKILLS.md`.
Entry format: `- YYYY-MM-DD: <what to do>. _Source: <agent/provider, run or issue>._`
Merge and dedupe; never overwrite or delete other entries. Never write secrets, OTPs, passwords, keys, or URLs that contain them.
Skills never override `../AGENTS.md` or `awin/AGENT.md`.
Merc skillbook comments: c2/4 https://github.com/SimonBarnett/a-search/issues/4123#issuecomment-6250157543 ,
c3/4 https://github.com/SimonBarnett/a-search/issues/4123#issuecomment-6250158558 ,
c4/4 https://github.com/SimonBarnett/a-search/issues/4123#issuecomment-6250159731 ,
answers https://github.com/SimonBarnett/a-search/issues/4123#issuecomment-6250191640 .
On 2026-10-18 `.grok/LESSONS.md` and `awin/.grok/skills/` were merged into the SKILLS.md files and retired; write new skills only here.

## Sign-in and MFA

- 2026-10-18: When `id.awin.com/u/mfa-otp-challenge` appears, stop and ask Simon for the code. There is no stored TOTP. Report
  `needs_otp` with the waiting advertiser ids, and meanwhile only write folders whose feed rows are already in scratch.
  _Source: Merc skillbook `a-search-awin-publisher-sign-in`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-publisher-sign-in/SKILL.md); (from awin/.grok/skills/a-search-awin-daily-signups/SKILL.md)._
- 2026-10-18: Check the session by opening the deep link first
  (`https://ui.awin.com/awin/affiliate/{AWIN_PUBLISHER_ID}/merchant-directory/index/tab/active`). If it shows publisher data
  you're signed in. After sign-in the URL must contain `/affiliate/{AWIN_PUBLISHER_ID}/`. _Source: Merc skillbook `a-search-awin-publisher-sign-in`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-publisher-sign-in/SKILL.md)._
- 2026-10-18: Awin's IdP is email-first (`ui.awin.com/idp` / `id.awin.com`). A redirect there from a UI page means the session expired.
  _Source: Merc skillbook `a-search-awin-publisher-sign-in`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-publisher-sign-in/SKILL.md)._
- 2026-10-18: Login file `awin.secret.txt` (redqueen `C:\passwords\awin.secret.txt`): line 1 = email (email field only), line 2 =
  password (password field only). Missing or unreadable: stop, report `needs_credential: awin.secret.txt`, never look anywhere
  else. Not two lines: stop and report "login file format" without showing it. _Source: Merc skillbook `a-search-awin-publisher-sign-in`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-publisher-sign-in/SKILL.md)._
- 2026-10-18: Never write the publisher id literally in a skill, filing or message: use `{AWIN_PUBLISHER_ID}`.
  _Source: Merc skillbook `a-search-awin-publisher-sign-in`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-publisher-sign-in/SKILL.md); (from awin/.grok/skills/a-search-awin-join-programme/SKILL.md)._

## UI steps

- 2026-10-18: Global Recommendations are **not** invites; nothing reaches the advertiser until we apply. Sent join requests show
  in account activity (and as `relationship=pending` in the read API). _Source: Merc skillbook `a-search-awin-invite-metrics`, #4123 c4/4 (from awin/.grok/skills/a-search-awin-invite-metrics/SKILL.md)._
- 2026-10-18: Join flow: open the programme, **+ Join**, promotional type, Promotion URL (if the modal has one), message, tick
  T&Cs, Join. Then confirm it shows as Pending. If the promotion type isn't confirmed, stay in dry run.
  _Source: Merc skillbook `a-search-awin-join-programme`, #4123 c4/4 (from awin/.grok/skills/a-search-awin-join-programme/SKILL.md)._
- 2026-10-18: Joins are dry-run by default (`AWIN_JOIN_DRY_RUN=true`); a live batch needs human approval for that batch. Promotion
  URL: `https://www.clubmadeira.uk/for-awin-advertisers` (`AWIN_PROMOTION_URL`). _Source: Merc skillbook `a-search-awin-join-programme`, #4123 c4/4 (from awin/.grok/skills/a-search-awin-join-programme/SKILL.md)._
- 2026-10-18: Awin has no public join/invite write API. Joins go through the UI only; never invent an API call.
  _Source: Merc skillbook `a-search-awin-join-programme`, #4123 c4/4 (from awin/.grok/skills/a-search-awin-join-programme/SKILL.md)._
- 2026-10-18: Skip suspended, closed or inactive programmes, and anything joined, pending or rejected in the last 90 days. Prefer
  programmes with a product feed and approval rate >= 99%. Don't create an `awin/{id}/` folder for a pending application,
  only on approval. _Source: Merc skillbook `a-search-awin-join-programme`, #4123 c4/4 (from awin/.grok/skills/a-search-awin-join-programme/SKILL.md)._
- 2026-10-18: Confirm an advertiser is **joined** on My Programmes before looking for its feed; the feed builder won't list
  advertisers we haven't joined (mark `notjoined`). _Source: Merc skillbook `a-search-awin-feed-link`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-feed-link/SKILL.md)._
- 2026-10-18: Invite metrics: stamp the snapshot date (recommendations change daily) and reconcile applied = approved + pending +
  rejected (+ unknown, stated). _Source: Merc skillbook `a-search-awin-invite-metrics`, #4123 c4/4 (from awin/.grok/skills/a-search-awin-invite-metrics/SKILL.md)._

## Limits and pacing

- 2026-10-18: Join/invite pacing: at most 20 joins and 20 invites a day by default (`AWIN_MAX_JOINS` / `AWIN_MAX_INVITES`), at
  least 30 s between submits, interactive batches of 6-12. On the daily cap, stop and queue the rest for tomorrow.
  _Source: Merc skillbook `a-search-awin-join-programme`, #4123 c4/4 (from awin/.grok/skills/a-search-awin-join-programme/SKILL.md)._
- 2026-10-18: Awin read API limit is 20 calls/min: budget 18 and back off on HTTP 429. _Source: Merc skillbook `a-search-awin-invite-metrics`, #4123 c4/4 (from awin/.grok/skills/a-search-awin-invite-metrics/SKILL.md)._

## Messages

- 2026-10-18: Join message hard limit is **149 characters** (Awin caps it at 150, not 170; Simon: "<150 chars"). Count before
  submitting; regenerate or trim at a word boundary; never let Awin truncate it. Write it for that advertiser, never a template.
  _Source: Merc skillbook `a-search-awin-join-programme`, #4123 c4/4 (from awin/.grok/skills/a-search-awin-join-programme/SKILL.md); #4123 answers comment; (from awin/.grok/skills/README.md)._
- 2026-10-18: Never put the publisher id or any credential in the join message text. _Source: Merc skillbook `a-search-awin-join-programme`, #4123 c4/4 (from awin/.grok/skills/a-search-awin-join-programme/SKILL.md)._

## Invites (scheduled)

- 2026-10-24: Daily Awin invites are the deterministic Node/Playwright job `invite.mjs` (shim `tools\invite.ps1`): Join Programmes / notJoined only; **zero LLM tokens**. Personalise ≤149-char messages from scraped name/sector/feed/approval. Gate with `_invites/{id}/` **`invitedat`** (90 days), not folder presence alone. Skip `awin/{id}/` folders. Cap `AWIN_MAX_JOINS` (20). Write `_invites` only after a live submit. Exit 2 on OTP. _Source: Simon 2026-10-24 (deterministic invites, personalisation, min tokens); invite-core.mjs._

## Feeds and downloads

- 2026-10-24: `logourl` is **required** on every enabled `awin/{id}/`. `onboard` always sets it: prefer Publisher API `programmes[].logoUrl`, else public CDN `https://ui.awin.com/images/upload/merchant/profile/{id}.png`. Backfills when missing; never overwrites; never uses product feed images; never downloads logo bytes. _Source: Simon 2026-10-24 ("affiliate metadata does not contain logourl - it MUST"); Invoke-FolderOnboard.ps1._
- 2026-10-24: `onboard` **deletes** only when Publisher API says **not joined**. Do **not** delete joined no-feed advertisers (discount coupons / offers). Keep `enabled=0` `disabledreason=nofeed`. Feed List absence alone is never delete. _Source: Simon 2026-10-24 ("some awin have no feed, but provide discount coupons"); AGENTS.md._ (supersedes earlier "delete all not on Feed List").
- 2026-10-24: Earlier: delete prefixes not on Feed List to save runtime. _Source: Simon 2026-10-24 ("DELETE disabled")._ (superseded 2026-10-24: keep nofeed for coupons; delete not-joined only).
- 2026-10-24: On create/merge of `awin/{id}/`, set `logo` from the programme UI or `programmedetails` profile image URL when present. Never use a product feed image (`merchant_image_url` / `aw_image_url`) as the merchant logo. Add only when missing; count `logo_missing` when Awin has none. _Source: Simon, 2026-10-24; AGENTS.md logo rule; awin/AGENT.md._ (superseded 2026-10-24: use logourl from programmes.logoUrl via onboard; no image download). (superseded 2026-10-24: key is logourl; URL only via onboard; no image-byte download).
- 2026-10-18: Fast path for feeds: the **Feed List** export on Create-a-Feed (`.../datafeed/step-one`) gives every joined feed at once
  (Advertiser ID, Feed ID, Membership Status, Language, product count). Pick `Membership Status = active`, language `en`. The
  export carries the real key: scratch only, never print, delete after the run. _Source: Merc skillbook `a-search-awin-feed-link`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-feed-link/SKILL.md)._
- 2026-10-18: House style per feed: CSV, gzip, the standard column set (don't trim columns the parser needs). Some advertisers
  have several feed ids; list them comma-separated in `feedid`, primary UK feed first.
  _Source: Merc skillbook `a-search-awin-feed-link`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-feed-link/SKILL.md); (from awin/.grok/skills/a-search-awin-merchant-feed-key/SKILL.md)._
- 2026-10-18: Joined but absent from Feed List and Create-a-Feed means `nofeed` (known cases: Lunzo, Lapert): send it to the
  no-feed follow-up. A feed URL that returns 0 rows or 404 is `feederror`; keep the row. _Source: Merc skillbook `a-search-awin-feed-link`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-feed-link/SKILL.md)._
- 2026-10-18: Feed test before `enabled=1`: fill the key in memory, request with a range/size limit; pass = HTTP 200, gunzip works,
  CSV header plus at least one data row. Don't save the file (the downloader owns `parts/`); never log the filled URL.
  _Source: Merc skillbook `a-search-awin-merchant-feed-key`, #4123 c3/4 (from awin/.grok/skills/a-search-awin-merchant-feed-key/SKILL.md)._
- 2026-10-18: Don't downgrade a verified folder: if `enabled=1` and today's feed test failed, set `enabled=0,
  disabledreason=feederror` only when a retry confirms it. _Source: Merc skillbook `a-search-awin-merchant-feed-key`, #4123 c3/4 (from awin/.grok/skills/a-search-awin-merchant-feed-key/SKILL.md)._
- 2026-10-18: Stored `feedurl` keeps the literal `{feedapikey}` / `{darwinhash}`; fill it in memory only for a test or download.
  _Source: Merc skillbook `a-search-awin-merchant-feed-key`, #4123 c3/4 (from awin/.grok/skills/a-search-awin-merchant-feed-key/SKILL.md); redqueen first `download` 2026-10-18 got HTTP 500 when the placeholder was not filled (#4176)._
- 2026-10-18: Folder names are the Awin advertiser id, digits only (= `affiliateid` = `awinmid`). A non-numeric id: skip and report,
  never write it. _Source: Merc skillbook `a-search-awin-merchant-feed-key`, #4123 c3/4 (from awin/.grok/skills/a-search-awin-merchant-feed-key/SKILL.md)._
- 2026-10-18: The legacy partner-portal "Add Key" flow (partner.clubmadeira.io) is **not** used; feeds are registered only as
  `awin/{id}/` folder metadata. _Source: Merc skillbook `a-search-awin-merchant-feed-key`, #4123 c3/4 (from awin/.grok/skills/a-search-awin-merchant-feed-key/SKILL.md); (from awin/.grok/skills/README.md)._
- 2026-10-20: A Feed List export goes stale within hours: advertisers approved later that day show as `Not Joined` or are missing (24739, 125822 and 126641 were approved after an 08:17 export). Before writing `notjoined` or `nofeed`, pull a fresh list from `feedlisturl` (key filled in memory only) and cross-check the Welcome folder. _Source: Grok Bot executor, awin onboarding run 2026-10-20 (24739, 125822, 126641, 22108, 22369)._
- 2026-10-20: Several feed ids with the same product count are usually duplicates (Mayfairsilk 22108: 50759, 84818 and 84819 all have 421 rows). Put only one in `feedid`, since listing all of them would import every product several times; prefer the feed already in use. _Source: Grok Bot executor, awin onboarding run 2026-10-20 (24739, 125822, 126641, 22108, 22369)._
- 2026-10-20: PcNova.co.uk (125822) and PCHUB.UK (126641) feeds had identical row counts (186069 each on 2026-10-20), so they probably share one catalogue. Flag possible duplicate products to the import rather than dropping either folder. _Source: Grok Bot executor, awin onboarding run 2026-10-20 (24739, 125822, 126641, 22108, 22369)._

## Daily run

- 2026-10-18: Compare My Programmes (Joined) with `awin/` folders: no folder = new; `enabled=0` = retry candidate; `enabled=1` = done,
  leave unchanged. Zero new approvals is still success: retry the `untested` / `feederror` folders anyway.
  _Source: Merc skillbook `a-search-awin-daily-signups`, #4123 c3/4 (from awin/.grok/skills/a-search-awin-daily-signups/SKILL.md)._
- 2026-10-18: Write the run report to stdout and a local log on the agent host (e.g. `C:\ai\a-search\logs\awin-agent\{yyyy-mm-dd}.json`),
  never under `a-affiliates/awin/`. Counts and advertiser ids only. _Source: Merc skillbook `a-search-awin-daily-signups`, #4123 c3/4 (from awin/.grok/skills/a-search-awin-daily-signups/SKILL.md)._
- 2026-10-18: Oscar's forwarded clubscan "New Awin Merchants Onboarded Today" report is legacy: use it only as a cross-check while it
  still arrives. _Source: Merc skillbook `a-search-awin-daily-signups`, #4123 c3/4 (from awin/.grok/skills/a-search-awin-daily-signups/SKILL.md)._
- 2026-10-18: No-feed follow-up cadence: re-check `disabledreason=nofeed` folders each daily run; after 7 days draft (don't send) a
  note asking the advertiser to enable a feed; after 30 days recommend leaving the programme (Simon decides). Merc's old
  Lunzo/Lapert routine stays paused unless Simon asks. Never delete the folder. _Source: Merc skillbook `a-search-awin-no-feed-follow-up`, #4123 c4/4 (from awin/.grok/skills/a-search-awin-no-feed-follow-up/SKILL.md)._

## Mailbox

- 2026-10-18: Welcome emails (`INBOX/Awin/Welcome`, from `no-reply@awin.com`) often don't contain the advertiser id. Resolve it from
  My Programmes (Joined) by exact name, or hold the row. Dedupe by advertiser id (name when id unknown); if a name can't be
  parsed, report the subject line only. _Source: Merc skillbook `a-search-awin-welcome-monitor`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-welcome-monitor/SKILL.md); (from awin/.grok/skills/a-search-awin-daily-signups/SKILL.md)._
- 2026-10-18: Welcome monitor runs weekdays 09:25, 13:25 and 17:25 UK time. Process only `UID > last` from `no-reply@awin.com`, write the
  highest UID back only after the hand-off succeeds, never move it backwards; if UID validity changed, stop and ask for a new
  starting UID. _Source: Merc skillbook `a-search-awin-welcome-monitor`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-welcome-monitor/SKILL.md)._
- 2026-10-18: The mailbox folder is spelt `INBOX/Awin/Commision Change` (sic): list in the run report only. `INBOX/Awin/Rejection`:
  record the advertiser as `rejected`, no feed work. Open folders read-only; never move, flag or delete mail.
  _Source: Merc skillbook `a-search-awin-welcome-monitor`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-welcome-monitor/SKILL.md)._
- 2026-10-18: IMAP needs the IONOS **app** password (the normal mailbox password fails with `AUTHENTICATIONFAILED`). If it fails, stop
  and report `needs_credential`. _Source: Merc skillbook `a-search-awin-welcome-monitor`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-welcome-monitor/SKILL.md)._

## Reviews (MRB)

- 2026-10-18: `merc-hostile-mrb`: never review your own build; pull main and run tests/typecheck/dry-runs yourself; grep runtime code for a
  literal publisher id, real keys, invented join APIs, madeiradb/portal writes and non-merge folder writes; verdict PASS /
  PASS-with-nits / FAIL in `docs/mrb-merc-YYYY-MM-DD-vN.md`; bars needing live credentials are "not run", not passed.
  _Source: Merc skillbook `merc-hostile-mrb`, #4123 c4/4 (from awin/.grok/skills/merc-hostile-mrb/SKILL.md)._
