# Tracked / affiliate links (FR-057 + FR-248)

Every link a-search **creates** for AFFILIATE or PROVIDER sources must carry
**our** network affiliate id and a **tenantId** reporting slot. MERCHANT sources
return the plain product URL (no affiliate params).

Helper: `shared/links/buildTrackedUrl.js` (accepts `source`) and
`shared/links/buildOutboundUrl.js` + `shared/links/networkParams.js` (FR-248).

## Taxonomy (FR-248 LOCKED)

Registry `class`: affiliate | merchant | provider.

| class | meaning | outbound |
|-------|---------|----------|
| **affiliate** | download parts + commission | our id + tenantId (+ partner/clickId slots) |
| **merchant** | download parts + GBP 20/shop subscription | plain product URL |
| **provider** | external live search | our id + tenantId |

Every `providers/registry.json` entry has `class`. `kind: live` -> `provider`.
Merchants have `merchantConnect: true`.

## Tenant id

- Widget `/go` (click time): host **clubId** (`Customers.clubId`, 8-char identity).
- API `POST /search` (result-write time): JWT `userId`.
- `partnerId` slots only when `isPartner(user)` (`Users.permissions` contains
  `'partner'` - see `shared/partners/isPartner.js`).
- `clickId` (FR-234) goes in a further slot where the network has one.

## Per-network slots (summary)

| source | class | our id | tenant | partner | clickId |
|--------|-------|--------|--------|---------|---------|
| awin | affiliate | `awinaffid` (+ `awinmid`) | `clickref` | `clickref2` | `clickref3` |
| impact | affiliate | path `/c/{mp}/{ad}/{campaign}` | `subId1` | `subId2` | `subId3` |
| partnerize | affiliate | `camref` | `pubref` | - | - |
| webgains | affiliate | `wgcampaignid` | `clickref` | - | - |
| tradedoubler | affiliate | `a` (+ `p`) | `epi` | - | `epi2` |
| admitad | affiliate | website id | `subid` | `subid1` | `subid4` |
| flexoffers | affiliate | `foid` | `fobs` | - | - |
| avantlink | affiliate | `pw` (+ `mi`) | `ctc` | - | - |
| amazon | provider | `tag` (base or per-tenant) | folded into tag when upgraded | - | - |
| ebay | provider | `campid` + EPN params | `customid` | - | - |
| etsy / rakuten | provider | `id` (+ `mid`) | `u1` | - | - |
| cj | provider | path `/click-{PID}-` | `sid` | - | - |
| skimlinks | provider | `id` | `xcust` | - | - |
| kelkoo / aliexpress / bol | provider | per `.env` | custom1 / aff_sub / subId | - | - |
| shopify, wix, woocommerce, squarespace, magento, bigcommerce, ecwid, prestashop | merchant | - | - | - | - |

Bug fixes (FR-248): Impact campaign is **not** `subId1`; Rakuten publisher is
query **`id`** (not `mid`); CJ website id is path PID (`sid` is tenant).

## Amazon Creators parity (FR-185)

Creators offer / detail URLs use the **same** `buildTrackedUrl` rules as PA-API
via `providers/live/amazon/src/stampAmazonTrackedUrl.js` (FR-248 `source: 'amazon'`).
Base clubs use `AMAZON_PARTNER_TAG` -> `tag=`; upgraded clubs may use a per-tenant
tag. Fail closed on empty tenantId or missing partner tag. Do not invent a second
Creators-only tagging path.

## Amazon per-tenant tags

Upgraded clubs (active Stripe `widget_upgrade`) may use
`{store}-{lower(tenantId)}-21` when the tag is listed in
`a_search.dbo.AmazonTrackingIds`. Otherwise use `AMAZON_PARTNER_TAG` and log
`amazon_tag_missing`. Ops alert when provisioned count crosses
`AMAZON_TAG_ALERT_AT` (default 50).

## Rules (CAST IRON)

| Rule | Detail |
|------|--------|
| Tenant | Widget: clubId. API: JWT userId. Never from request body. |
| Account | Publisher / campaign ids from provider `.env` / Secrets Manager only. |
| Fail closed | Missing affiliate id or tenantId for affiliate/provider -> error; never emit untracked URL. |
| Merchant | No affiliate / tenant query params. |
| Replace | If a URL already carries network id params, replace rather than append. |
| Secrets | Never commit real account values. |

## Call shape

```js
const { buildTrackedUrl } = require('../../shared/links/buildTrackedUrl');

const tracked = buildTrackedUrl({
  url: detailPageUrl,
  userId: jwtUserId, // or clubId on /go
  source: 'awin',
  env: message.env,
  envVars: process.env,
});
```

Widget path uses `shared/widgets/go.js` `defaultStampUrl` -> `buildOutboundUrl`.

## SQL read-time rewriting (`dbo.Part2`) vs create-time tracking

madeiradb `dbo.Part2` may rewrite affiliate URLs on SQL reads. **Do not tag
twice** when a-search already applied `buildTrackedUrl` / `buildOutboundUrl`.
madeiradb is read-only for a-search (FR-251).
