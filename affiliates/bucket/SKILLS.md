# a-affiliates: general skills (all affiliate agents)

Location: `s3://a-affiliates/SKILLS.md` (`S:\a-affiliates\SKILLS.md`). Rules: `AGENTS.md` section 13 "Skills harvest".
Load order: `AGENTS.md`, then **this file**, then `{provider}/AGENT.md`, then `{provider}/SKILLS.md`.

Only **general** skills go here: true for any affiliate network or any browser sign-in. Provider-specific ones go in
`{provider}/SKILLS.md`. Entry format: `- YYYY-MM-DD: <what to do>. _Source: <agent/provider, run or issue>._`
Merge and dedupe; never overwrite or delete other entries. Never write secrets, OTPs, passwords, keys, or URLs that contain them.
Skills never override `AGENTS.md` or a provider `AGENT.md`.
Merc skillbook comments: c2/4 https://github.com/SimonBarnett/a-search/issues/4123#issuecomment-6250157543 ,
c3/4 https://github.com/SimonBarnett/a-search/issues/4123#issuecomment-6250158558 ,
c4/4 https://github.com/SimonBarnett/a-search/issues/4123#issuecomment-6250159731 ,
answers https://github.com/SimonBarnett/a-search/issues/4123#issuecomment-6250191640 .
On 2026-10-18 `.grok/LESSONS.md` and `awin/.grok/skills/` were merged into the SKILLS.md files and retired; write new skills only here.

## Sign-in and MFA

- 2026-10-18: At any OTP / MFA prompt, tick **"Trust this computer"** (or "I trust this machine", "Trust this device", "Remember this
  device", "Remember this computer", "Don't ask again") before submitting the code, in the provider's persistent browser profile,
  so later runs skip MFA. If there's no such checkbox, enter the OTP once anyway, report `trust_checkbox_missing` with the visible
  label texts, and ask Simon.
  _Source: Simon, 2026-10-18 14:59 BST ("remember to click the trust this computer"); AGENTS.md section 10; (from .grok/LESSONS.md)._
- 2026-10-18: On an OTP challenge, a captcha, an "unusual activity" screen or any sign-in you can't get past: stop and ask
  Simon, naming the step and the affected advertiser ids. One code from Simon per challenge; enter it once. Never guess,
  never loop, never fail silently. _Source: Merc skillbook `a-search-awin-publisher-sign-in`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-publisher-sign-in/SKILL.md); (from .grok/LESSONS.md)._
- 2026-10-18: Read the ACL'd login file in process and fill the fields through the browser automation API. No temp file, no clipboard,
  never echo or log it (the provider file names the path). This supersedes the skillbooks' older "type from a password-only
  temp file / xdotool" method. _Source: (from .grok/LESSONS.md); (from awin/.grok/skills/README.md); #4123 answers comment; (from awin/.grok/skills/a-search-awin-publisher-sign-in/SKILL.md) (superseded part)._
- 2026-10-18: Email-first sign-in: type the email, press Continue, and wait for the password step to load. Never type the
  password on the email screen. _Source: Merc skillbook `a-search-awin-publisher-sign-in`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-publisher-sign-in/SKILL.md)._
- 2026-10-18: Wrong password or account locked: stop and tell Simon. Retry at most once (lockout risk).
  _Source: Merc skillbook `a-search-awin-publisher-sign-in`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-publisher-sign-in/SKILL.md)._
- 2026-10-18: After sign-in, check you're on the right account (the URL / account switcher shows our publisher). If another
  account is selected, switch before doing anything. _Source: Merc skillbook `a-search-awin-publisher-sign-in`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-publisher-sign-in/SKILL.md)._
- 2026-10-18: Keep one long-lived browser profile per provider so cookies persist and OTP prompts stay rare. Never export
  or copy cookies or session tokens to other tools. _Source: Merc skillbook `a-search-awin-publisher-sign-in`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-publisher-sign-in/SKILL.md)._

## Sessions

- 2026-10-18: Treat these as "session expired, sign in again once": a redirect to the IdP / login page, HTTP 401/403 from
  the site's XHR calls, a page that loads with no publisher/account name, or a CSV/export/builder that returns login HTML or an
  empty list instead of data. If it expires again within minutes, report a flaky session and do read-only work only.
  _Source: Merc skillbook `a-search-awin-publisher-sign-in`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-publisher-sign-in/SKILL.md); (from awin/.grok/skills/a-search-awin-feed-link/SKILL.md)._

## UI steps

- 2026-10-18: **Wait for real content.** Directory / join lists often show a spinner over an empty table. Wait for a concrete row
  action (e.g. "Join Program") before scraping or clicking. _Source: (from .grok/LESSONS.md)._
- 2026-10-18: **Prefer the listing action.** Join/apply controls often live in the table's Actions column (e.g. "Join Program" with
  a +), not only on the advertiser's profile page. _Source: (from .grok/LESSONS.md)._
- 2026-10-18: If a join/apply modal shows fields you don't recognise, take a screenshot, Cancel and report. Never improvise
  answers to T&Cs. _Source: Merc skillbook `a-search-awin-join-programme`, #4123 c4/4 (from awin/.grok/skills/a-search-awin-join-programme/SKILL.md)._
- 2026-10-18: If an activity or list page paginates or truncates, say so (`truncated: true`). Never extrapolate counts.
  _Source: Merc skillbook `a-search-awin-invite-metrics`, #4123 c4/4 (from awin/.grok/skills/a-search-awin-invite-metrics/SKILL.md)._

## Messages and invites

- 2026-10-18: Write each join/invite message for that advertiser, unique within the run and within the provider's character limit
  (see `{provider}/AGENT.md` and `{provider}/SKILLS.md`). _Source: (from .grok/LESSONS.md); AGENTS.md section 9._
- 2026-10-18: Write `{provider}/_invites/{id}/` immediately after each successful invite. No re-invite within 90 days.
  _Source: (from .grok/LESSONS.md); AGENTS.md section 9._
- 2026-10-18: Outbound messages to advertisers (e.g. "please enable a product feed" notes) are drafts only until a human approves
  and sends them. _Source: Merc skillbook `a-search-awin-no-feed-follow-up`, #4123 c4/4 (from awin/.grok/skills/a-search-awin-no-feed-follow-up/SKILL.md)._

## Invites

- 2026-10-24: Prefer a **deterministic scheduled invite job** (no LLM) for network outreach: personalise messages from scraped advertiser fields, enforce `_invites` **`invitedat` 90-day** cooldown (not presence alone), skip already-foldered ids, stop on OTP for a human. _Source: Simon 2026-10-24 (min tokens + personalisation); AGENTS.md §9._

## Folders and S3

- 2026-10-24: Affiliate meta key `logourl` is **required** on every enabled folder (HTTPS). `onboard` always sets it (provider API logo when present, else that network's public CDN profile URL), backfills when missing, never overwrites a non-empty value, never downloads image bytes. Count `logourlSet` / `logourlBackfilled`. _Source: Simon, 2026-10-24 ("affiliate metadata does not contain logourl - it MUST")._
- 2026-10-24: Keep joined no-feed affiliates (`disabledreason=nofeed`) for discount coupons/offers. `onboard` deletes only when the joined API says not joined — never solely for missing Feed List entry. _Source: Simon 2026-10-24 (coupons / no feed); AGENTS.md._ (supersedes earlier "delete all not on feed list").
- 2026-10-24: Affiliate folder meta must carry `logo` (HTTPS URL of the advertiser logo) when the provider supplies one. On `onboard` / folder create, set it; on merge, add it only when missing or empty — never overwrite a non-empty `logo`, never invent a URL. If metadata would exceed 2 KB, put `logo` in `{provider}/{id}/affiliate.json`. Count `logo` backfills and `logo_missing` in the run report. _Source: Simon, 2026-10-24 ("the meta of the affiliate should include their logo image - add if missing during onboard"); AGENTS.md sections 5-6, 11._ (superseded 2026-10-24: key renamed to logourl; URL only, no image-byte download). (superseded 2026-10-24: key is logourl; URL only via onboard; no image-byte download).
- 2026-10-18: After any folder-marker write, head-object it again: the key ends in `/`, `ContentLength=0`, `ServerSideEncryption=AES256`,
  the required keys are present, `feedurl` holds only `{placeholders}`, and the `last*` values are unchanged.
  _Source: Merc skillbook `a-search-awin-merchant-feed-key`, #4123 c3/4 (from awin/.grok/skills/a-search-awin-merchant-feed-key/SKILL.md)._
- 2026-10-18: If the merged metadata would exceed 2 KB, drop optional keys first; if it still doesn't fit, use a JSON object next to
  the marker (e.g. `{provider}/{id}/affiliate.json`). _Source: Merc skillbook `a-search-awin-merchant-feed-key`, #4123 c3/4 (from awin/.grok/skills/a-search-awin-merchant-feed-key/SKILL.md); (from awin/.grok/SKILLS-OVERVIEW.md)._
- 2026-10-18: S3 AccessDenied: stop the batch and report it. Never try other credentials. Resume next run from the backlog.
  _Source: Merc skillbook `a-search-awin-merchant-feed-key`, #4123 c3/4 (from awin/.grok/skills/a-search-awin-merchant-feed-key/SKILL.md); (from awin/.grok/skills/a-search-awin-daily-signups/SKILL.md)._
- 2026-10-20: On redqueen, `download` fails with `no_backend: neither aws nor rclone available` when the shell PATH lacks the AWS CLI. Prepend `C:\Program Files\Amazon\AWSCLIV2` to the process PATH, set `A_SEARCH_S3_MOUNT=S:\`, and pass `-Path S:\a-affiliates\{provider}\{affiliateid}`: a folder created a minute earlier may not show on the S: mount yet. Run `download -WhatIf` first. _Source: Grok Bot executor, awin onboarding run 2026-10-20 (24739, 125822, 126641, 22108, 22369)._

## Secrets and feeds

- 2026-10-18: A feed or export download URL usually embeds the account key, so treat the whole URL as a secret. Keep it
  only in memory or in a gitignored scratch file (check with `git check-ignore`) that you delete after the run. In reports show
  only id, name, feed id and "feed URL present: yes/no", or the URL with `{placeholder}`s.
  _Source: Merc skillbook `a-search-awin-feed-link`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-feed-link/SKILL.md)._
- 2026-10-18: Before anything reaches chat, IRC, intake, a report or a log, replace strings matching `.../apikey/...`, `apikey=`,
  `Bearer ` or `password` with `[REDACTED]`. _Source: Merc skillbook overview, #4123 comment 1/4 (from awin/.grok/SKILLS-OVERVIEW.md)._
- 2026-10-18: Never paste whole email bodies or report HTML into chats, filings or skills: name, id and date only.
  _Source: Merc skillbook `a-search-awin-welcome-monitor`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-welcome-monitor/SKILL.md); (from awin/.grok/skills/a-search-awin-daily-signups/SKILL.md)._
- 2026-10-18: If you ever print a URL or key by accident: stop, tell Simon the key may need rotating, and file a redacted
  issue. _Source: Merc skillbook `a-search-awin-feed-link`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-feed-link/SKILL.md)._
- 2026-10-18: Never build a feed URL by guessing feed ids. A joined advertiser with no listed feed is `nofeed`.
  _Source: Merc skillbook `a-search-awin-feed-link`, #4123 c2/4 (from awin/.grok/skills/a-search-awin-feed-link/SKILL.md); (from awin/.grok/skills/a-search-awin-no-feed-follow-up/SKILL.md)._
