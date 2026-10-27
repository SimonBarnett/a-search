# Impact: provider skills (impact/)

Location: `s3://a-affiliates/impact/SKILLS.md` (`S:\a-affiliates\impact\SKILLS.md`). Rules: `../AGENTS.md` section 13 "Skills harvest".
Load order: `../AGENTS.md`, then `../SKILLS.md`, then `impact/AGENT.md`, then **this file**.

Only skills specific to Impact go here (its URLs, screens, limits, ids, feeds). General skills go in `../SKILLS.md`.
Entry format: `- YYYY-MM-DD: <what to do>. _Source: <agent/provider, run or issue>._`
Merge and dedupe; never overwrite or delete other entries. Never write secrets, OTPs, passwords, keys, or URLs that contain them.
Skills never override `../AGENTS.md` or `impact/AGENT.md`.

## Sign-in and MFA

- 2026-10-18: Partner signup entry is `https://app.impact.com/login.user` → choose **Partner** → **Continue with Email**. Do not open `https://app.impact.com/signup` (returns Page Not Found). Prefer Email over Apple/Google so agents can sign in from `C:\passwords\impact.txt`. _Source: impact publisher signup walkthrough with Simon; help.impact.com Sign Up as a Partner._
- 2026-10-18: UI login file on redqueen is `C:\passwords\impact.txt` (two CRLF lines: email, password) — filename is `impact.txt`, not `impact.secret.txt`. Never create, copy or print it. _Source: Simon, 2026-10-18; redqueen `C:\passwords` listing (names only)._

## UI steps

- 2026-10-18: Marketplace application statuses are In Review → Approved or Declined (decision ~72 hours). Declined shows: "You currently do not qualify for access to impact.com's Marketplace" and still allows brand unique sign-up links and invitations. Check status on the partner dashboard / Discover → Brands access. _Source: impact Marketplace Declined notice to Simon; help.impact.com Understand Your Marketplace Application Status._
- 2026-10-18: After a Marketplace Declined result, do not use Discover → Brands → Apply. Strengthen company info, verified media properties (primary `https://smartcatalogue.uk`) and public profile, then appeal via support ticket (or PDM). Common return reasons: incomplete information; media property concerns; limited reach or activity; MPA violations. _Source: Simon chose appeal path 2026-10-18; help.impact.com decline reasons table._

## Limits and pacing

_(no entries yet)_

## Messages

- 2026-10-18: Message / apply character limit still **UNKNOWN** until the first brand Apply form is reachable (blocked while Marketplace Declined). Record it in `impact/AGENT.md` at first successful open of the join form. _Source: impact/AGENT.md; signup walkthrough 2026-10-18._

## Feeds and downloads

- 2026-10-24: When creating `impact/{affiliateid}/`, set `logourl` to the brand HTTPS logo URL from Impact (campaign/brand profile). Onboard merges add `logourl` only if missing. URL only — no image-byte download. Never invent a URL. _Source: Simon, 2026-10-24; AGENTS.md logourl rule._

## Mailbox

_(no entries yet)_