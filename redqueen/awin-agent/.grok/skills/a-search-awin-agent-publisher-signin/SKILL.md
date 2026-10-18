---
name: a-search-awin-agent-publisher-signin
description: >
  FR #4126 / #4123 redqueen Awin agent - Publisher sign-in.
  Sign in to ui.awin.com with C:\passwords\awin.secret.txt (line 1 email,
  line 2 password). On redqueen fill fields in-process (no temp file, no
  clipboard). OTP/captcha means stop and ask Simon. Use before any Awin UI task.
---

# Awin publisher sign-in (onboarding CWD)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never put a password, OTP, IMAP app password, API token, feed URL (it carries an apikey), or publisher id in a filing, skill, or log.

## When to use

- Any skill in this CWD needs an Awin UI page (`a-search-awin-agent-feed-link-pulls`,
  `a-search-awin-agent-global-recommendations`, `a-search-awin-agent-invite-metrics`,
  `a-search-awin-agent-daily-signups`).
- A UI page that should show publisher data redirects to `ui.awin.com/idp` /
  `id.awin.com`, shows the login form, or returns an empty shell. That means
  the session expired.

## Inputs

| Input | Source |
|---|---|
| `AWIN_PUBLISHER_ID` | `.env` / `publisherid` on the `awin/` provider marker |
| Login file | `AWIN_SECRET_FILE` = `awin.secret.txt` (redqueen: `C:\passwords\awin.secret.txt`, ACL SYSTEM + Administrators). Two CRLF lines: **line 1 = email, line 2 = password** |
| OTP (rare) | **Simon only.** No TOTP is stored anywhere |
| Browser | The persistent Awin browser profile on the agent host (keeps OTP prompts rare) |
| Target URL | The page the calling skill needs (deep link) |


## Redqueen Windows sign-in (Simon 2026-10-18) --- CAST IRON for this host

redqueen is Windows. Do **not** use xdotool. Do **not** write a password-only
temp file. Do **not** use the clipboard.

1. Drive the browser with the agent automation (e.g. Playwright Node) using a
   persistent Chromium/Edge profile under `C:\ai\a-search\awin-agent\profile\`
   (ACL like `C:\passwords`).
2. Read line 1 and line 2 of `C:\passwords\awin.secret.txt` **in-process**.
3. Fill the email field with line 1 and the password field with line 2 directly.
4. Never log the password or email. No temp file, no clipboard.
5. Run the sign-in check inside the same daily run (no separate desktop session).
6. On OTP (`id.awin.com/u/mfa-otp-challenge`) or captcha: **stop** and notify Simon.

## Steps


1. Open the target deep link first, e.g.
   `https://ui.awin.com/awin/affiliate/{AWIN_PUBLISHER_ID}/merchant-directory/index/tab/active`.
   If it shows publisher data, you are already signed in. Stop here.
2. If you are redirected to the IdP (`ui.awin.com/idp`, `id.awin.com/...`) or a
   login form, sign in **email-first**. Type the email from **line 1** of the
   login file, press Continue, then wait for the password step to load. Never
   type the password on the email screen.
3. Type the password from **line 2 only**. Never echo it, never `cat` the file,
   and never put it on a command line, in chat or in a log.
   **On redqueen (Windows):** follow **Redqueen Windows sign-in** above ---
   fill the password field in-process (no temp file, no clipboard).
   Agents never create, copy or move `awin.secret.txt` itself.
   **Linux-only historical note:** some seats used a shredded temp file +
   `xdotool type --file`; that path is not for redqueen.
4. **OTP challenge:** if `id.awin.com/u/mfa-otp-challenge` appears, **stop and
   ask Simon** for the current code. There is no stored TOTP. Report the step
   and the advertiser ids waiting on it. Enter the code once. Never guess,
   never loop, and never fail silently. Do the same for a captcha or any
   sign-in screen you can't get past.
5. After login, check that you are on the right account. The URL should
   contain `/affiliate/{AWIN_PUBLISHER_ID}/`, and the account switcher should
   show the Club Madeira publisher. If another account is selected, switch.
6. Re-open the original deep link and hand control back to the calling skill.
7. **Session-expiry detection** (for the calling skill): treat any of these as
   "expired, re-run this skill once":
   - a redirect to `/idp` or `id.awin.com`
   - HTTP 401/403 from a ui.awin.com XHR
   - a page that loads but shows no publisher name
   - a CSV or feed builder that returns a login HTML page instead of data

## Success criteria

- The target page shows data for `{AWIN_PUBLISHER_ID}`.
- No credential value appears in the transcript, logs, reports or files, and
  no temp file or clipboard was used for the password on redqueen.

## Failure modes / stop rules

| Symptom | Action |
|---|---|
| Wrong password / account locked | Stop and tell Simon. Retry at most once (lockout risk) |
| `id.awin.com/u/mfa-otp-challenge` and Simon not available | Stop and report `needs_otp` with the affected advertiser ids. Do not loop |
| Login file missing or unreadable | Stop and report `needs_credential: awin.secret.txt`. Never look for the login anywhere else, and never invent one |
| Login file not two lines | Stop. Report "login file format" without showing its contents |
| Captcha / unusual-activity screen | Stop and notify Simon. Hand the browser over |
| Session expires again within minutes | Sign in once more. If it happens again, report a flaky session and do read-only work only |

## Security

- Password: login file line 2, held only in-process for the field fill. OTP:
  Simon only. Neither is ever logged.
- Keep one long-lived browser profile for Awin so cookies persist. Do not
  export or copy cookies or session tokens to other tools.
- Never write the publisher id literally into a skill or filing. Use
  `{AWIN_PUBLISHER_ID}`.
