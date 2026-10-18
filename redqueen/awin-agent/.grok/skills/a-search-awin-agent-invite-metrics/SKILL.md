---
name: a-search-awin-agent-invite-metrics
description: >
  FR #4126 Merc playbook for redqueen/awin-agent. Measure Club Madeira's Awin outreach: compare Global Recommendations (which
  are NOT invitations) with the join requests actually sent (Awin account
  activity), and list recommended merchants we skipped. Use when asked "how many
  Awin merchants did we invite / apply to?" or before planning a join batch.
---

# Awin invite metrics (onboarding CWD)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never put a password, OTP, IMAP app password, API token, feed URL (it carries an apikey), or publisher id in a filing, skill, or log.

## When to use

- Weekly outreach summary, or "how many did we apply to this month?".
- Before `a-search-awin-agent-global-recommendations` to find skipped recommendations.

## Key facts

- **Global Recommendations are not invites.** Awin shows them as suggestions;
  nothing is sent to the merchant until we apply.
- **Outbound join requests** show in the Awin account activity log (and as
  `relationship=pending` / later `joined` / `rejected` via the read API).

## Inputs

| Input | Source |
|---|---|
| Recommendations | Awin UI Global Recommendations (export or page scrape: name, advertiser id) |
| Activity | Awin account activity (join requests sent, date) |
| Relationship counts | read API `programmes?relationship=pending|joined|rejected` with `AWIN_API_TOKEN` (optional) |
| Window | date range, default last 30 days |

## Steps

1. Sign in (`a-search-awin-agent-publisher-signin`).
2. Collect recommendations: `{advertiserId, name}`.
3. Collect sent join requests in the window from account activity: `{advertiserId, name, date}`.
4. Optional: pull relationship lists from the read API for joined / pending / rejected counts.
5. Diff:
   - `applied` = in activity.
   - `skipped` = recommended − applied − already joined.
   - `approved` = applied ∩ joined; `rejected` = applied ∩ rejected; `pending`.
6. Report: counts per bucket, approval rate (approved / applied), and the
   `skipped` list (name, id, why if known — suspended, no feed, low approval rate).

## Success criteria

- Numbers reconcile: applied = approved + pending + rejected (+ unknown, stated).
- The skipped list is ready to feed the join skill.

## Failure modes / stop rules

| Symptom | Action |
|---|---|
| Activity page paginates / truncates | Say so (`truncated: true`); do not extrapolate |
| Read API 429 | Back off; the Awin limit is 20 calls/min — budget 18 |
| Recommendations change daily | Stamp the snapshot date in the report |

## Security

- Read-only. No joins from this skill. No token in output.
