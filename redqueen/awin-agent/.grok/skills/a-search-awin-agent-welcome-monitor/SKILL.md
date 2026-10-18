---
name: a-search-awin-agent-welcome-monitor
description: >
  FR #4126 Merc playbook for redqueen/awin-agent. Watch the Club Madeira Awin mailbox over IMAP for new "Welcome" emails from
  Awin (programme join approved), track the last processed UID, extract the
  merchant name (and advertiser id when present), and hand each new merchant
  to a-search-awin-agent-daily-signups. Also sorts Rejection and Commission Change
  mail. Use on the weekday Welcome-monitor schedule or when asked "any new
  Awin approvals?".
---

# Awin Welcome monitor (onboarding CWD)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never put a password, OTP, IMAP app password, API token, feed URL (it carries an apikey), or publisher id in a filing, skill, or log.

## When to use

- Scheduled: weekdays 09:25, 13:25, 17:25 UK time (Europe/London).
- On demand: "did any Awin merchants approve us?".

## Inputs

| Input | Source |
|---|---|
| IMAP host / port | `AWIN_WELCOME_IMAP_HOST` (IONOS, 993, TLS) |
| IMAP user | `AWIN_WELCOME_IMAP_USER` (Club Madeira Awin mailbox; publisher alias delivers there) |
| IMAP app password | `AWIN_WELCOME_IMAP_APP_PASSWORD` — IONOS **app** password from the secret store (the normal mailbox password will not work) |
| Folder | `AWIN_WELCOME_FOLDER` (default `INBOX/Awin/Welcome`) |
| State | `AWIN_WELCOME_STATE_PATH` — file holding the last processed UID (integer only) |

Other folders in the same mailbox:

| Folder | Meaning | Action |
|---|---|---|
| `INBOX/Awin` | general Awin noise / newsletters | ignore |
| `INBOX/Awin/Rejection` | programme declined us | record merchant as `rejected` in the run report; no feed work |
| `INBOX/Awin/Commision Change` (sic — spelling as in the mailbox) | commission terms changed | list in the run report only |

## Steps

1. Read the last processed UID from `AWIN_WELCOME_STATE_PATH` (missing file →
   ask the human for a starting UID; do not reprocess the whole folder).
2. Connect over IMAPS (993, TLS) with the app password. Select
   `AWIN_WELCOME_FOLDER` read-only.
3. Search for messages with `UID > last` **and** `FROM no-reply@awin.com`.
   Sort by UID ascending.
4. For each message, extract:
   - `merchant` — the advertiser name from the subject/body ("Welcome to …",
     "… has accepted your application").
   - `advertiserId` — **only if present** in the body or a link
     (`awinmid=`, `/merchant/{id}`, `mid=`). It is often **not** in Welcome
     emails. If absent, resolve it from My Programmes (Joined tab) via
     `a-search-awin-agent-publisher-signin`, by exact merchant name, or leave it
     `null` and flag "id from My Programmes / later content email".
   - `date` (ISO-8601) and `uid`.
5. Optionally scan `INBOX/Awin/Rejection` and `INBOX/Awin/Commision Change`
   for the same UID window and add them to the run report.
6. Hand each new `{uid, merchant, advertiserId, date}` to
   `a-search-awin-agent-daily-signups` (or write a catch-up JSON in `.scratch/`).
7. Only after the hand-off succeeds, write the highest processed UID back to
   `AWIN_WELCOME_STATE_PATH`. Never move it backwards.
8. Report: count found, merchants (name + id or "id pending"), new max UID.
   "No new Welcome emails" is a valid success.

## Success criteria

- Every Welcome message with UID above the stored value is reported exactly once.
- State file advances to the highest processed UID, and only after the hand-off.
- No mailbox password or app password in output.

## Failure modes / stop rules

| Symptom | Action |
|---|---|
| `AUTHENTICATIONFAILED` | App password missing/revoked. Stop; report `needs_credential: IONOS app password`. Do not try the normal mailbox password |
| Folder not found | List folders, report actual names (watch for the "Commision" spelling); do not create folders |
| UID validity changed | Stop; ask the human for a new starting UID (UIDs reset) |
| Welcome without a parsable merchant name | Report the subject line only (no body dump) and continue |
| Same merchant twice | Dedupe by advertiser id (or name when id unknown) |

## Security

- IMAP read-only (`EXAMINE` / read-only select). Never delete, move, or flag mail.
- Never paste full email bodies into chat or intake — merchant name, id, date only.
- The app password lives only in the secret store / uncommitted `.env`.
