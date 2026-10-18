---
name: a-search-awin-agent-daily-signups
description: >
  FR #4126 Merc playbook for redqueen/awin-agent. End-to-end daily Awin onboarding for the #4123 agent: collect newly approved
  advertisers (My Programmes Joined vs existing a-affiliates/awin folders, plus
  Welcome-monitor hand-offs), dedupe, pull feed links, create or merge
  s3://a-affiliates/awin/{advertiserid}/ folders, raise no-feed follow-ups,
  and write the run report. Use on each daily run, or when asked to "onboard
  today's Awin signups".
---

# Awin daily signups, end to end (onboarding CWD)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never put a password, OTP, IMAP app password, API token, feed URL (it carries an apikey), or publisher id in a filing, skill, or log.

## When to use

- The daily scheduled run (single-instance lock held; see #4123 "Daily run").
- When `a-search-awin-agent-welcome-monitor` hands over new merchants.
- On demand: "onboard today's Awin signups".

## Inputs

| Input | Source |
|---|---|
| Joined programmes | Awin UI My Programmes (Joined), or the read API `programmes?relationship=joined` when `apitoken` is set |
| Existing folders | `aws s3 ls s3://a-affiliates/awin/` + head-object per id |
| Welcome hand-offs | `a-search-awin-agent-welcome-monitor` |
| Daily Awin Report (legacy, optional) | Oscar's forward of the clubscan "New Awin Merchants Onboarded Today" list. Use it only as a cross-check while it still arrives |
| Backlog | Previous run's results file (local, no secrets) |

## Steps

1. **Collect** advertisers from all inputs. The advertiser id is digits only.
   For Welcome-only rows with no id, resolve the id from My Programmes by
   exact name, or hold the row until the next run.
2. **Dedupe** by advertiser id. Drop ids already finished in the backlog, and
   keep their reason.
3. **Compare with S3.** Any joined id without an `awin/{id}/` folder is new.
   An id whose folder has `enabled=0` is a retry candidate. An id whose
   folder has `enabled=1` is done, so leave it unchanged.
4. **Feed links** for new ids and retry candidates: run
   `a-search-awin-agent-feed-link-pulls` (sign in first with
   `a-search-awin-agent-publisher-signin`). Prefer the Feed List export for the
   whole batch.
5. **Write folders** with `a-search-awin-agent-merchant-feed-key`: create or merge,
   test the feed, and set `enabled=1` only on a verified feed. Ids with no feed
   get `enabled=0, disabledreason=nofeed` and go to
   `a-search-awin-agent-nofeed-followup`.
6. **Run report:** write it to stdout and to the local log file on the agent
   host (e.g. `C:\ai\a-search\logs\awin-agent\{yyyy-mm-dd}.json`), **not**
   under `a-affiliates/awin/`. Include counts and advertiser ids only:
   invited, joined, approved, folders created, folders updated, no-feed
   follow-ups, and waiting (needs OTP / not resolved). Also a short table
   `advertiserId | store | feed (yes/no/none) | folder (created/merged/unchanged) | enabled | reason`.
   No URLs, no keys.
7. Save the run results (no feed URLs) as the next run's backlog. Delete the
   scratch feed files.

In `-DryRun` mode, list what would be created or updated and make no S3 writes.

## Success criteria

- Every approved advertiser ends as `created`, `merged`, `unchanged`,
  `nofeed`, `waiting` or `fail`, each with a reason. None are silently dropped.
- No duplicate folders, and existing `last*` state is untouched.
- The report contains no secrets.

## Failure modes / stop rules

| Symptom | Action |
|---|---|
| Awin sign-in needs OTP (`id.awin.com/u/mfa-otp-challenge`) | Stop and ask Simon. Meanwhile, write folders only for merchants whose feed rows are already in scratch, and report the rest as `needs_otp` |
| S3 unavailable / AccessDenied | Report progress and resume next run from the backlog |
| Zero new approvals | That counts as success. Still retry the `enabled=0` folders that have `untested` / `feederror` |
| A second instance starts | Exit 0 with `already_running` (the lock is held by the caller) |

## Security

- Report tables never include feed URLs, apikeys, the darwin hash or passwords.
- Do not forward raw email or report HTML into chats or filings. Summarise it.
- Never write to madeiradb or the old partner portal.
