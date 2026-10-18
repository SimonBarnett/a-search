# ComponentsPiece merchant / partner / Stripe docs lock (FR-214)

**Repo:** SimonBarnett/a-search
**Phase:** 5 - ComponentsPiece
**Status:** LOCKED docs park (issue #1219). No live Stripe calls, OAuth apps, or billing handlers in this FR.
**Parent:** [feature-request-components-piece-2026-10-09.md](feature-request-components-piece-2026-10-09.md)
**Architecture:** [components-piece.md](components-piece.md) (FR-195 / widgetGuid / a-search DB)

Where this file conflicts with earlier FR-214..224 stubs or CP13/CP18 wording in the
feature-request park, **this file wins** (Simon updates 2026-10-10 on #1219).

## Goal

Document the merchant signup / shop go-live wizard, partner and club widget-copy
pages, Stripe product gates, source taxonomy, and unpaid rules **without**
implementing billing.

## Source taxonomy (LOCKED)

| Class | What we do | Money | Examples |
|-------|------------|-------|----------|
| AFFILIATE | Download parts **and** earn commission | Outbound links carry our affiliate id + tenantId | Awin, Impact, Partnerize, Webgains, Tradedoubler, Admitad, FlexOffers, AvantLink |
| MERCHANT | Download parts **and** charge GBP 20/shop/month | No affiliate stamping / commission | Shopify, Wix, WooCommerce, Squarespace, Magento/Adobe Commerce, BigCommerce, Ecwid |
| PROVIDER | External **live search** (no local catalogue hold for fee) | Outbound links carry our affiliate id + tenantId | Amazon, eBay, Etsy, Rakuten, CJ, Kelkoo, Skimlinks, AliExpress, bol |

- `tenantId` = 8-char credited club id (`Customers.clubId`) for widget clicks, or JWT `userId` for API search (FR-248).
- Registry plans `class: affiliate | merchant | provider` (FR-248).
- Merchants never appear in commission flows. Club revenue-share of merchant
  subscription income is FR-249 (#1363).
- eBay and Etsy are **providers** (search), not merchant connectors.
- PrestaShop is **dropped** (Simon); never list `prestashop` in merchant pickers.

## Merchant connectors (seven)

| Platform | FR | Auth style (docs lock) |
|----------|----|------------------------|
| Shopify | FR-236 (#1350) | OAuth / app install |
| Wix | FR-237 (#1351) | OAuth / app install |
| WooCommerce | FR-238 (#1352) | OAuth / app install |
| Squarespace | FR-242 (#1356) | OAuth / app install |
| Magento / Adobe Commerce | FR-243 (#1357) | OAuth / app install |
| BigCommerce | FR-245 (#1359) | OAuth / app install |
| Ecwid | FR-246 (#1360) | OAuth / app install |

Merchant onboarding process FRs: FR-235..FR-243 (+ FR-245/246). Providers stay on
the existing provider registry / enable path.

## Merchant wizard (LOCKED flow)

1. Shared login entry (FR-229).
2. **SMS OTP** verify at signup (phone captured; FR-228 update). Other roles keep
   email OTP / magic link unless their FR says otherwise.
3. Account created -- **no payment at signup**.
4. "Add shop" -- provider picker (FR-215) among the seven merchant platforms.
5. Provider connect (FR-216 + platform FR).
6. Shop state `pending_payment`.
7. **GBP 20/month Stripe subscription per shop** (FR-239), VAT inclusive, no free
   trial, one shop = one subscription = one invoice. Metadata product:
   `merchant_shop`.
8. Shop `live` only while the subscription is active.
9. Parts import + weekly refresh (FR-240).

A merchant may add many shops. Payment gate applies **per shop going live**, not
to account creation.

## Stripe products (do not conflate)

| Product | Price | Scope | Metadata `aSearchProduct` | FR |
|---------|-------|-------|---------------------------|----|
| Merchant shop | GBP 20/shop/month (VAT incl.) | Per shop | `merchant_shop` | FR-239 (#1353) |
| Widget Upgrade | GBP 10/host/month | Per host/customer; unlocks full-screen full catalogue | `widget_upgrade` | #1345 |

- **Partners are never billed** (Simon). They are only **paid** commission through
  Stripe payouts (FR-222 #1227).
- The monthly partner plan (FR-223 #1228) is **dropped**. Never use
  `partner_monthly` in tables, enums, webhook routes, or tests.
- Optional payout Connect for partners remains FR-222 (payouts only).

## No-commission / no-stamping rules

- Merchant shop parts carry **no** affiliate tracking or commission stamping
  (by definition we get no automatic commission).
- Parts from a **live** (subscribed) shop are commission-free for that merchant
  (CP13 superseded: merchants never generate commission).
- Fail-when: any path that requires commission from a monthly-subscribed merchant
  shop, or that stamps affiliate ids on merchant shop outbound links.
- Partners: paid via FR-222 payouts; not charged a monthly plan fee.

## Unpaid rules (FR-241 #1355)

1. Unpaid shops (`past_due` / `unpaid` / `incomplete` / `canceled`) are **never
   downloaded**.
2. After **2 consecutive unpaid billing periods per shop**, that shop's held data
   is hard-deleted. The merchant can always log in, re-subscribe, and reconnect.
   Notices N1-N3, removal cascade, 30-day restore default, and DBA steps for
   madeiradb `Users` follow [partner-removal.md](partner-removal.md) patterns
   where applicable; a-search owned tables live in `a_search` (FR-251).

## Partner / club widget copy pages

- **smartcatalogue.uk** -- partner mode-select + copy-embed page (FR-219).
- **clubmadeira.uk** -- same page for clubs (FR-220).
- Copy pages call `POST /widgets` to mint a **widgetGuid**; the copied snippet
  contains `data-widget-guid` (FR-232 rule 4). The host is **not** in the snippet.
- Dual DNS TXT (LOCKED, also in components-piece.md): Club TXT is required (club id).
  Partner TXT is optional (partnerId for agency commission). Partner TXT alone never
  unlocks destinations.
- Chrome extension is a **third** widget-creation surface (#1344), alongside the
  two copy pages.

## Database ownership (FR-251 #1365)

All SQL tables this FR documents for writes (`Merchants`, `OtpCodes`, `Shops`,
subscriptions, stats) live in the a-search database (`a_search` /
`a_search_sandbox`), created by `db/migrations/`. madeiradb is **read-only**
through `mdb.*` views. a-search must not modify madeiradb.

## Out of scope (this FR)

- Live Stripe API calls
- OAuth app implementation
- Connector workers / import jobs (platform FRs)
- Chrome extension binary (#1344)

## Related

- Issue #1219 (FR-214)
- FR-215..FR-222 stubs in `docs/fr/`
- FR-223 dropped (monthly partner plan)
- FR-232 widgetGuid #1346; FR-233 docs amendments #1347
- FR-235..FR-246 merchant shops / connectors; FR-241 unpaid; FR-248/249 taxonomy + share
- FR-251 a-search DB #1365
- Mocks: `docs/mocks/components-piece-merchant/`, `docs/mocks/components-piece-partner/`
