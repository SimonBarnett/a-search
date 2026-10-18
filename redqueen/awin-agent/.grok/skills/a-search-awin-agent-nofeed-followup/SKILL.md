---
name: a-search-awin-agent-nofeed-followup
description: >
  FR #4126 Merc playbook for redqueen/awin-agent. Handle joined Awin merchants that have no product feed in Create-a-Feed /
  the product-data list (e.g. Lunzo, Lapert): re-check on a schedule, ask the
  merchant or Awin to enable the feed, and close out once a feed appears. Use
  when a-search-awin-agent-feed-link-pulls records no_feed_in_create_a_feed.
---

# Awin no-feed follow-up (onboarding CWD)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never put a password, OTP, IMAP app password, API token, feed URL (it carries an apikey), or publisher id in a filing, skill, or log.

## When to use

- `a-search-awin-agent-feed-link-pulls` returned `no_feed_in_create_a_feed`.
- Daily run: re-check every `awin/{id}/` folder with `enabled=0`,
  `disabledreason=nofeed`. (Merc's old standalone Lunzo/Lapert feed-unlock
  routine is paused. Resume it only when Simon asks.)

## Inputs

| Input | Source |
|---|---|
| No-feed list `[{id, name, firstSeen}]` | `awin/{id}/` folders with `disabledreason=nofeed` (`lastmod` / local backlog for `firstSeen`) |
| Awin session | `a-search-awin-agent-publisher-signin` |

## Steps

1. For each merchant, confirm still joined (My Programmes) and still absent
   from Create-a-Feed.
2. If a feed now appears, run `a-search-awin-agent-feed-link-pulls` and then
   `a-search-awin-agent-merchant-feed-key`. That merges the folder, tests the feed,
   and sets `enabled=1` only when the feed returns data. If it's still absent,
   leave the folder `enabled=0, disabledreason=nofeed` and merge only `lastmod`.
3. If still absent after 7 days: draft (do not send) a short note to the
   merchant via the Awin messaging / contact route asking them to enable a
   product feed for publishers, and hand it to the human / Oscar to send.
4. Record `lastChecked` and the outcome. Report "still no feed" merchants weekly.

## Success criteria

- Every no-feed merchant has `lastChecked` within the cadence and a next step.

## Failure modes / stop rules

- Never build a feed URL by guessing `fid` values.
- Never send merchant messages without human approval.
- If a merchant stays feedless for 30 days, recommend leaving the programme (human decides).
- Never delete the folder. It stays `enabled=0`.

## Security

- Same feed-URL rules as `a-search-awin-agent-feed-link-pulls`.
