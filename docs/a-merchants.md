# a-merchants (FR #4008)

Private S3 bucket and Lambdas for **merchant provider** credentials (API keys,
Stripe customer/subscription for the £20/shop monthly sub, email) and **parts**
downloads. Deployed as standalone CDK stack `AMerchants` (`cdk/bin/merchants.js`).
Does **not** modify `ASearchStack`, `APartsGateway`, `a-clubs`, or madeira
resources.

Mirrors [a-affiliates.md](a-affiliates.md) (FR #3999). Daily import of parts is
FR #4001.

## Runtime choice: ONE daily Lambda for both buckets (FR #4269)

This stack owns a **single** daily Node 24 Lambda (`a-search-merchants-weekly`)
scheduled with EventBridge `rate(1 day)`. Env:

| Env | Role |
|-----|------|
| `A_MERCHANTS_BUCKET` | Required; downloads `enabled=1` merchants with `lastdownload` >= 7 days old |
| `A_AFFILIATES_BUCKET` | Optional; when set, same run also downloads `enabled=1` affiliates with stale `lastdownload` |

Missing `enabled` is treated as disabled. Affiliate feeds reuse
`affiliates/src/downloadOne` (placeholders + flat dated keys; FR #4178 / #4195).
If AAffiliates also ships its own schedule, operators may disable one to avoid
double downloads; the documented dual-bucket owner is **AMerchants**.

Immediate download: S3 `ObjectCreated` on merchant markers invokes
`a-search-merchants-oncreated` (same handler pattern can accept affiliate markers
when the event bucket equals `A_AFFILIATES_BUCKET`).

## Bucket

| Property | Value |
|----------|--------|
| Name (code/outputs) | `a-merchants` |
| Fallback if global name taken | `a-search-merchants` (ops records real name in outputs) |
| Public access | Block all (`BlockPublicAccess.BLOCK_ALL`) |
| Transport | `enforceSSL: true` (deny insecure) |
| Encryption | SSE-S3 (`BucketEncryption.S3_MANAGED`) |
| Removal | `RemovalPolicy.RETAIN`, `autoDeleteObjects: false` |
| Lifecycle | Expire objects with size > 0 after 35 days (`objectSizeGreaterThan: 0`; zero-byte markers kept). Lambda retention keeps last N=4 dated parts files. |

Account/region target: `620257466932` / `eu-west-2`.

## Key layout

Zero-byte marker objects carry S3 **user metadata** (name/value pairs), same idea
as a-clubs and a-affiliates.

```
a-merchants/
  {provider}/                              # marker key `{provider}/`
  {provider}/AGENT.md                      # agent invite / create instructions
  {provider}/provider.json                 # optional overflow when metadata > 2 KiB
  {provider}/{merchantid}/                 # marker key `{provider}/{merchantid}/`
  {provider}/{merchantid}/merchant.json    # optional overflow when metadata > 2 KiB
  {provider}/{merchantid}/parts/{yyyy-mm-dd}.{ext}
```

Provider slug and `merchantid` must match `[a-z0-9._-]+` (lower-case).

Default `{ext}` for API merchants is `jsonl` (one JSON product object per line).

## Provider metadata keys (`{provider}/`)

App-level detail only:

| Key | Notes |
|-----|--------|
| `name` | Display name (e.g. Shopify) |
| `apibase` | API base URL template / host |
| `apiversion` | API version string (e.g. `2024-10`) |
| `appclientid` | OAuth / app client id (not a shop secret) |
| `instructions` | Always `AGENT.md` (file beside the marker) |
| `lastmod` | ISO UTC last metadata change |

If the combined user-metadata payload exceeds ~2 KiB, put overflow JSON at
`{provider}/provider.json` (same secret rules). Helpers expose
`METADATA_SOFT_MAX_BYTES` and `providerJsonKey`.

## Merchant metadata keys (`{provider}/{merchantid}/`)

Merchants pay **us** (£20/shop monthly via Stripe Customer) --- Stripe ids are
allowed here (unlike affiliates).

| Key | Notes |
|-----|--------|
| `merchantid` | Lower-case slug id |
| `name` | Display name |
| `apikey` | Provider API key (**secret** --- never log) |
| `apisecret` | Provider API secret (**secret** --- never log) |
| `accesstoken` | OAuth / Admin API token (**secret** --- never log) |
| `shopdomain` | e.g. `example.myshopify.com` |
| `stripecustomerid` | Stripe Customer id (`cus_…`) for the £20 sub |
| `stripesubscriptionid` | Stripe Subscription id once created |
| `email` | Merchant contact (**secret** --- never log) |
| `format` | `jsonl` \| `json` \| `csv` \| `xml` (default `jsonl`) |
| `enabled` | `1` or `0` |
| `lastdownload` | ISO UTC of last attempt |
| `laststatus` | `ok`, `parts_exists`, `http_*`, `missing_credentials`, … |
| `lastsize` | Bytes of last successful body |
| `lastmod` | ISO UTC last metadata change |
| `lastimport` / `importstatus` | Written by daily import FR #4001 |

Optional `feedurl` for non-API providers (direct file download).

Overflow beyond ~2 KiB goes in `{provider}/{merchantid}/merchant.json`.

**Never log** API keys, tokens, secrets, or emails (`redactForLog`). Tests use
`FAKE_` placeholders only.

## AGENT.md template (invite merchants)

Place at `{provider}/AGENT.md`. Suggested contents:

```markdown
# {provider} merchant onboarding

When a merchant signs up:

1. Confirm the provider slug is `{provider}` (lower-case).
2. Choose `merchantid` as a stable slug (Shopify: myshopify subdomain).
3. Create zero-byte marker `{provider}/{merchantid}/` with metadata:
   - merchantid, name, shopdomain, email
   - apikey / apisecret / accesstoken as required by this provider
   - stripecustomerid (and stripesubscriptionid when the £20 sub exists)
   - format=jsonl, enabled=0 until a test download succeeds
4. Do not duplicate an existing merchantid under this provider.
5. Trigger or wait for ObjectCreated download; on laststatus=ok set enabled=1.
6. Never paste secrets into chat, tickets, or logs.
```

### Shopify example

```
shopify/                                 # provider marker
shopify/AGENT.md
shopify/my-bike-shop/                    # merchant marker
shopify/my-bike-shop/parts/2026-10-18.jsonl
```

Provider metadata example (names only; no real secrets):

- `name=Shopify`
- `apibase=https://{shop}.myshopify.com/admin/api`
- `apiversion=2024-10`
- `appclientid=FAKE_appclientid`
- `instructions=AGENT.md`

Merchant metadata example:

- `merchantid=my-bike-shop`
- `shopdomain=my-bike-shop.myshopify.com`
- `accesstoken=FAKE_accesstoken_example_only`
- `stripecustomerid=cus_FAKEEXAMPLE`
- `email=FAKE_merchant@example.invalid`
- `format=jsonl`
- `enabled=1`

The downloader pages `GET /admin/api/{version}/products.json` with header
`X-Shopify-Access-Token` and writes JSONL (one product JSON per line).

## Download behaviour

1. **On creation**: ObjectCreated on `{provider}/{merchantid}/` -> immediate
   one-merchant download.
2. **Daily** (FR #4269): EventBridge `rate(1 day)` -> ONE Lambda covers
   merchants + optional affiliates (`enabled=1` and `lastdownload` >= 7 days
   stale only).
3. Merchants write `parts/{yyyy-mm-dd}.{ext}` (never overwrite that day).
   Affiliates write flat `{yyyy-mm-dd}.{ext}` via `affiliates/src/downloadOne`.
4. One failure does not stop others. Logs include **ids only**.
5. Retention: delete dated parts beyond last N=4; lifecycle is backup.

IAM: Get/Put/List/DeleteObject on `a-merchants` (+ `a-affiliates` for the daily
role). No a-clubs, no madeira.

## Synth / deploy

```bash
npm ci
npm run stage-merchants
npx cdk synth --app "node cdk/bin/merchants.js" AMerchants \
  -c account=620257466932 -c region=eu-west-2

npx cdk deploy --app "node cdk/bin/merchants.js" AMerchants \
  -c requireDeployEnv=true \
  -c account=620257466932 -c region=eu-west-2
```

Or: `npm run synth:merchants` / `npm run deploy:merchants`.

`cdk diff` for this app should show **only** new `AMerchants` resources.

## Code map

| Path | Role |
|------|------|
| `shared/merchants/keys.js` | Slug + key path helpers |
| `shared/merchants/metadata.js` | Normalize/validate; `redactForLog` |
| `shared/merchants/retention.js` | Pick dated keys beyond N |
| `merchants/src/downloadOne.js` | One merchant download + meta + retain |
| `merchants/src/downloadAffiliateOne.js` | Affiliate feed download (dual-bucket) |
| `merchants/src/runWeekly.js` | Dual-bucket orchestration |
| `merchants/src/onCreated.js` | ObjectCreated immediate download |
| `merchants/src/handler.js` | Lambda entries |
| `merchants/src/memoryS3.js` | In-memory S3 for tests |
| `cdk/lib/merchants-stack.js` | Stack |
| `cdk/bin/merchants.js` | App entry (`resolveDeployEnv`) |
| `scripts/stage-merchants-lambda-asset.js` | Stage Lambda asset |

## Out of scope

- Daily redqueen import into DB / a-clubs (FR #4001).
- Onboarding UI (seed markers by hand or a small script).
- Modifying ASearchStack or a-clubs.
