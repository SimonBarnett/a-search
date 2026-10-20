# AGENT — Rakuten publisher signup (FR #4701)

Publisher id: **4766177**. Daily agent applies to advertisers, tracks approvals, and records applications. **No SQL download folders or feeds** for Rakuten (live Product Search is separate).

## Priority order

1. Model flying, RC, and hobby advertisers first
2. Then wider UK retail

## Application message character limit: 500

Each application message is unique per advertiser and must fit this limit.

## Records (`rakuten/_applications/{mid|slug}/`)

Zero-byte S3 marker with metadata: `mid`, `name`, `status` (`pending|approved|declined`), `appliedat`, `firstappliedat`, `applycount`, `lastchecked`, `approvedat`, `source` (`agent|merc-manual`), `message` (truncated ASCII). Never invent MIDs — key by name slug until the dashboard shows a MID.

## Dedupe

Never re-apply within **90 days**. Never re-apply when status is Pending or Approved.

## Sign-in

Merc-style code for publisher dashboard. On captcha or code failure: stop and notify Simon (no retry loop). Password from `C:\passwords\rakuten.secret.txt` only — never print it.

## Notification

When Pending -> Approved: notify Simon once naming advertiser/MID and that `/search` can be rerun for MMFC.
