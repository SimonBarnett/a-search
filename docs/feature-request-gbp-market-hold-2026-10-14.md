# Feature request: GBP / UK market hold (stop scope creep)

**Repo:** SimonBarnett/a-search  
**Plan session:** `work/plan-20261014-121400`  
**Compared tip:** `origin/main` @ `65640ea` (detached worktree under this plan folder)  
**Operator lock (2026-10-14):** Hold any merchant, affiliate, or provider that does not sell specifically in **GBP**, or is irrelevant to the **UK / Club Madeira** target market. **Do not delete** code or folders. **Spend no more tokens** on hold ids (no enable tips, no fix FRs, no hostile loops). Keep main UK-capable networks and merchant platforms (Shopify / Woo / Wix / et al.). Affiliates: prefer best UK coverage; do not stack redundant non-UK feeds.

Shape: reuse existing **service** (LOCKED in `docs/vision.md`).

## Objective

Fan-out and backlog spend only on sources that serve **UK shoppers priced in GBP** (or UK merchant shops that sell in GBP). Non-GBP / wrong-market sources stay in the repo as **held** scaffolds (`enabled.live/sandbox=false`), with open enable/fix issues marked **hold / not planned**.

## Success

| id | metric | target | how measured | fail-when |
|----|--------|--------|--------------|-----------|
| H1 | Market gate documented | `docs/provider-shortlist.md` + this FR + phase-4 index state a LOCKED GBP/UK hold rule and list hold vs keep ids | Pin test asserts needles; docs ASCII | Gate missing or hold ids still described as next enable work |
| H2 | Hold ids dark in registry | `bol`, `aliexpress`, `avantlink`, `flexoffers`, `admitad` have `enabled.live=false` and `enabled.sandbox=false` | `tests/registry` / per-FR pin + `node` JSON read | Any hold id still `true` on either env |
| H3 | No token burn on hold backlog | Open enable/fix issues and PRs for hold ids are commented **hold / not planned** and closed or left non-offerable | `gh issue/pr` state + comment | Chair still offers FR-176 flexoffers tip or equivalent hold work |
| H4 | Keep set still on | Keep ids remain individually switchable; no mass delete of provider folders | Diff shows registry toggles + docs only for hold path; folders remain | Provider folder deleted or keep id flipped false by mistake |
| H5 | Floor pins retargeted | After three disables, SQS/CDK / hostile enablement floors match new enabled count | Synth + hostile floor tests green | Floor expects old 15x2 (or current tip count) after disable |

LOCKED (operator 2026-10-14). Shape UNKNOWN for UI (no new screens).

## Keep (continue tokens when needed)

UK / GBP-capable or Madeira merchant path (do **not** hold in this wave):

| id | kind | Notes |
|----|------|-------|
| `amazon` | live | PA-API host `webservices.amazon.co.uk` / marketplace UK |
| `ebay` | live | Marketplace id configurable; UK demand |
| `rakuten` | live | Keep for now (UK Advertising programmes exist); revisit if coverage weak |
| `cj` | live | Network search; UK advertisers |
| `kelkoo` | live | Price comparison; UK strong |
| `skimlinks` | live | Meta across networks |
| `etsy` | live | Keep for now (UK GBP sellers exist); revisit if club overlap stays weak |
| `awin` | local | Canonical UK/EU aggregator |
| `impact` | local | Brand/DTC feeds |
| `partnerize` | local | Travel/finance depth |
| `tradedoubler` | local | EU aggregator with UK |
| `webgains` | local | Keep dark-or-enable path; EU retail overlaps Awin but UK programmes exist (not in hold set this wave) |
| `shopify` | merchant | UK merchant shops |
| `wix` | merchant | UK merchant shops (enable when ready) |
| `woocommerce` | merchant | UK merchant shops (enable when ready) |
| Future merchant connect | merchant | Magento / Squarespace / BigCommerce / Ecwid / etc. stay in backlog when they serve GBP shops |

## Hold (no more tokens; do not delete)

| id | kind | Registry now (65640ea) | Why hold |
|----|------|------------------------|----------|
| `bol` | live | **enabled true** | Benelux (NL/BE) marketplace; EUR primary; irrelevant to GBP catalogue |
| `aliexpress` | live | **enabled true** | CN volume marketplace; not GBP-native; compliance-heavy for club catalogues |
| `avantlink` | local | **enabled true** | US outdoor/retail feeds |
| `flexoffers` | local | already false | US mid-tail feeds |
| `admitad` | local | already false | Broad geo; quality varies; weak GBP focus |

**Out of scope this wave:** deleting folders, removing CDK constructs wholesale, or re-litigating Amazon Creators / multi-region.

## Gap vs origin/main (`65640ea`)

- Shortlist still markets `bol` / `aliexpress` / `avantlink` as enabled success stories; no GBP/UK hold section.
- Registry has three hold ids **on** (`bol`, `aliexpress`, `avantlink`) so fan-out still spends SQS/worker capacity.
- Open **FR-176** `#1023` + tip PR `#1536` still spend tokens on flexoffers (US).
- Closed enables for bol/aliexpress/avantlink already landed; need **disable** FRs (not re-open enable).
- Hostile / floor pins expect high enabled counts; must retarget after disables (keep-both hygiene).

## Anti-omnibus small FRs (drafts)

Unfiled until operator approves park. One GitHub issue per FR later.

| Draft | Goal | Deliverables | Testable |
|-------|------|--------------|----------|
| FR-252 | Lock GBP/UK market-hold rule in docs | Update `docs/provider-shortlist.md`, `docs/phase4-enablement-index.md`, `docs/vision.md` Success note or cross-link; add this FR markdown under `docs/` | Pin asserts hold/keep tables + "do not delete" + "no more tokens" needles; ASCII |
| FR-253 | Disable `bol` both envs | `providers/registry.json` `bol.enabled` false/false; scrub from "enabled" narrative; retarget floors for -1 provider | Pin: bol false both envs; folder still exists; synth/floor counts |
| FR-254 | Disable `aliexpress` both envs | Same pattern as FR-253 for `aliexpress` | Pin: aliexpress false; folder remains |
| FR-255 | Disable `avantlink` both envs | Same pattern for `avantlink` | Pin: avantlink false; folder remains |
| FR-256 | Formal hold `flexoffers` + `admitad` (already dark) | Docs mark HOLD; comment+close or hold-label open `#1023` / PR `#1536`; ensure no new enable tip | Issue/PR comment evidence; registry stays false; pin docs HOLD |
| FR-257 | Retarget enablement hostile floors after three disables | Single docs/tests PR adjusting ENABLED count / `Nx2` floors / STILL_DARK lists so CI matches new registry | `npm test` floor pins green vs registry enabled count |

Filing order after approval: FR-252 first (docs gate), then 253-255 (one id each), then 256 (backlog hold), then 257 if floors not folded into 253-255.

## Open GitHub actions (after approve; Plan does not IRC)

Mark **hold / not planned** (comment + close or `!ignore` via chair as ops prefers):

| Ref | Title | Action |
|-----|-------|--------|
| #1023 | FR-176 Enable flexoffers | Comment market-hold; close as not planned / hold |
| PR #1536 | flexoffers tip | Comment hold; close unmerged |
| (optional) any open tips that only re-enable bol/aliexpress/avantlink | Close citing FR-253..255 |

**Do not** close merchant enable paths (`#1026` wix, `#1027` woo) or webgains `#1020` in this wave.

## Decision (LOCKED)

- Target market: **UK shoppers / GBP catalogue** (Club Madeira / smartcatalogue.uk).
- Hold set: `bol`, `aliexpress`, `avantlink`, `flexoffers`, `admitad`.
- Keep merchants and main UK-capable affiliates as listed.
- Code retention: **hold = registry false + docs + stop backlog**, never `rm` provider trees.

## Park checklist (Plan)

1. Operator approves this pack.
2. Copy docs into a clean `origin/main` worktree; open docs PR with **Refs** (not Closes) for implementation FRs once filed.
3. File small FRs one-at-a-time (or batch after zero-open if operator says so) with Goal / Deliverables / Testable.
4. Comment hold on `#1023` / `#1536` when FR-256 lands or immediately as ops FR.
