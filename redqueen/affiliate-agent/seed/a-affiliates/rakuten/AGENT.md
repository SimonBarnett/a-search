# AGENT --- Rakuten publisher signup (FR #4701 / #5065)

Publisher id: **4766177**. Daily agent applies to advertisers, tracks approvals, and records applications. **No SQL download folders or feeds** for Rakuten (live Product Search is separate).

## Priority order

1. Model flying, RC, and hobby advertisers first
2. Then wider UK retail

## Application message character limit: 500

Each application message is unique per advertiser and must fit this limit.

## Records (`rakuten/_invites/{mid}/`)

FR #5065 uses the Awin-shaped `_invites/{mid}/` marker (not a second `_applications/` tree). Metadata: `invitedat`, `firstinvitedat`, `invitecount`, `name`, `invitemsg`, `source`. Reconcile MIDs from Partnerships API --- never invent Christow's MID.

## Dedupe

Never re-apply within **90 days**. Never re-apply when status is Pending or Approved.

## Sign-in

Merc-style code for publisher dashboard. On captcha or code failure: stop and notify Simon (no retry loop). Password from `C:\passwords\rakuten.secret.txt` only --- never print it.

## Notification

When Pending -> Approved: notify Simon once naming advertiser/MID and that `/search` can be rerun for MMFC.
