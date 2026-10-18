---
name: a-search-awin-agent-global-recommendations
description: >
  FR #4126 Merc playbook for redqueen/awin-agent. Send Awin programme join requests for Club Madeira from Global
  Recommendations / the merchant directory: pick active, high-approval
  merchants with a product feed, fill promotion type, Promotion URL and a
  message of at most 149 characters, respect daily caps, and record outcomes.
  UI-only (Awin has no public join write API); dry-run by default. Use when asked
  to "join more Awin merchants" or on a join-batch schedule.
---

# Awin join programme (onboarding CWD)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never put a password, OTP, IMAP app password, API token, feed URL (it carries an apikey), or publisher id in a filing, skill, or log.

## When to use

- Simon / Oscar asks for a join batch.
- `a-search-awin-agent-invite-metrics` shows recommended merchants we never applied to.

## Inputs

| Input | Source |
|---|---|
| Candidates | Global Recommendations / Join Programmes in the Awin UI; or `list_join_candidates` from `SimonBarnett/club-madeira-awin-connector` (read-only API, `relationship=notjoined`, `approvalPercentage`) |
| `AWIN_PROMOTION_URL` | `.env` — `https://www.clubmadeira.uk/for-awin-advertisers` |
| `AWIN_PROMOTION_TYPE` | `.env` — **unset until confirmed in the live modal** (connector U1). Do not guess |
| `AWIN_JOIN_DRY_RUN` | default `true` |
| Message | per-advertiser, ≤ 149 chars (Awin) |

## Selection rules

1. Product feed available (ProductFeed = Yes) — no feed means nothing to search.
2. Not joined, not pending, not rejected in the last 90 days.
3. Programme **active** — skip suspended, closed, or "inactive" programmes.
4. Prefer approval rate ≥ 99% (connector criteria); then most recently seen.
5. Caps: `AWIN_MAX_JOINS` / `AWIN_MAX_INVITES` (default 20 per day each), at
   least 30 s between submits, interactive batches of 6–12.
6. Do **not** create an `a-affiliates/awin/{id}/` folder for a pending
   application. Folders are made only on approval (`a-search-awin-agent-daily-signups`).


## Join / invite message (Simon 2026-10-18; Awin cap)

- Write a **unique** message for each advertiser (Grok first, then Cursor), using
  that advertiser's name, sector, and website or programme description. Mention
  why their products suit model-club members and Smart Catalogue / Club Madeira.
- Hard cap: **at most 149 characters** (Awin's limit is 150; leave one char of
  headroom). Validate length before submit; if too long, regenerate or trim at a
  word boundary. Never let Awin truncate.
- Never reuse the same text for two advertisers in one run.
- Persist the sent message (or first 149 chars) on
  win/_invites/{advertiserid}/ as metadata invitemsg (stay under 2 KB total
  metadata).
- Do **not** use a fixed over-length template from older AGENT.md drafts.

## Steps

1. Sign in (`a-search-awin-agent-publisher-signin`).
2. Build the candidate list (UI Global Recommendations, or the connector CLI
   `list_join_candidates --publisherId {AWIN_PUBLISHER_ID}` with `AWIN_API_TOKEN`).
3. Apply the selection rules; show the human the batch (name, id, approval %)
   when running interactively.
4. **Dry-run (default):** record `{advertiserId, name, wouldJoin: true, message}`
   and stop. Do not click Join.
5. **Live (only when `AWIN_JOIN_DRY_RUN=false` and the human approved this batch):**
   for each merchant: open the programme → **+ Join** → promotional type
   (`AWIN_PROMOTION_TYPE`) → Promotion URL field (if the modal has one) =
   `AWIN_PROMOTION_URL` → message → tick T&Cs → Join. Wait 30 s before the next one.
6. Confirm each shows as **Pending** (My Programmes → Pending, or API
   `programmes?relationship=pending`).
7. Report: applied, skipped (with reason), failed. Approvals arrive later as
   Welcome emails → `a-search-awin-agent-welcome-monitor`.

## Success criteria

- Dry-run: candidate list with reasons, no Join clicks.
- Live: every applied merchant shows Pending; no merchant applied twice; caps held.

## Failure modes / stop rules

| Symptom | Action |
|---|---|
| Promotion type unknown | Stop live mode; stay in dry-run and ask the human |
| Modal layout differs (new fields) | Screenshot, Cancel, report — do not improvise answers to T&Cs |
| Daily cap reached | Stop; queue the rest for tomorrow |
| Programme suspended/inactive mid-batch | Skip with reason |
| Any request to "use the API to join" | There is no public join write API. Do not invent one; UI or a queued UI worker only |

## Security

- No credentials in messages. Do not include the publisher id in the message text.
- Live joins are outbound actions under Club Madeira's name: human approval per batch.
