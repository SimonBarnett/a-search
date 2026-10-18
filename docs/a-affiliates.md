# a-affiliates (FR #3999)

Private S3 bucket and weekly Lambda for affiliate network **provider login** and
**affiliate parts** downloads. Deployed as standalone CDK stack `AAffiliates`
(`cdk/bin/affiliates.js`). Does **not** modify `ASearchStack`, `APartsGateway`,
`a-clubs`, or madeira resources.

## Why Lambda (not Fargate)

v1 uses a **Node 20 Lambda** (15 min timeout, EventBridge `rate(7 days)`).
Fargate is a documented follow-up if feeds exceed Lambda time or ephemeral
storage limits.

## Bucket

| Property | Value |
|----------|--------|
| Name (code/outputs) | `a-affiliates` |
| Fallback if global name taken | `a-search-affiliates` (ops records real name in outputs) |
| Public access | Block all (`BlockPublicAccess.BLOCK_ALL`) |
| Transport | `enforceSSL: true` (deny insecure) |
| Encryption | SSE-S3 (`BucketEncryption.S3_MANAGED`) |
| Removal | `RemovalPolicy.RETAIN`, `autoDeleteObjects: false` |
| Lifecycle | Expire objects with size > 0 after 35 days (safety net; zero-byte markers kept). Lambda retention keeps last N=4 dated parts files. |

Account/region target: `620257466932` / `eu-west-2` (same as other a-search stacks).

## Key layout

Zero-byte marker objects carry S3 **user metadata** (name/value pairs), same idea
as a-clubs host/GUID markers.

```
a-affiliates/
  {provider}/                              # marker key `{provider}/`
  {provider}/provider.json                 # optional overflow when metadata > 2 KiB
  {provider}/{affiliateid}/                # marker key `{provider}/{affiliateid}/`
  {provider}/{affiliateid}/parts/{yyyy-mm-dd}.{ext}
  {provider}/{affiliateid}/parts/latest.{ext}
```

Provider slug and `affiliateid` must match `[a-z0-9._-]+` (lower-case).

`{ext}` comes from affiliate `format` + `compression`:

| format | compression | ext |
|--------|-------------|-----|
| csv/xml/json | none | `csv` / `xml` / `json` |
| csv/xml/json | gzip | `csv.gz` / `xml.gz` / `json.gz` |
| csv/xml/json | zip | `csv.zip` / `xml.zip` / `json.zip` |

## Provider metadata keys (`{provider}/`)

Everything an agent needs to log into that network:

| Key | Notes |
|-----|--------|
| `name` | Display name (e.g. Awin) |
| `loginurl` | Browser login URL |
| `apibase` | API base URL |
| `publisherid` | Publisher / site id |
| `username` | Login username (**secret** --- never log) |
| `password` | Login password (**secret** --- never log) |
| `apitoken` | API token (**secret** --- never log) |
| `authtype` | `password` \| `token` \| `oauth` |
| `lastmod` | ISO UTC last metadata change |

If the combined user-metadata payload exceeds ~2 KiB, put overflow JSON at
`{provider}/provider.json` (same secret rules). Helpers expose
`METADATA_SOFT_MAX_BYTES` and `providerJsonKey`.

## Affiliate metadata keys (`{provider}/{affiliateid}/`)

Everything needed to download that affiliate's parts file. Affiliates pay
**commission** --- there are **no** Stripe fields.

| Key | Notes |
|-----|--------|
| `affiliateid` | Lower-case slug id |
| `name` | Display name |
| `feedurl` | Direct feed URL (preferred) |
| `feedid` | Alternate: provider feed id (+ template) |
| `format` | `csv` \| `xml` \| `json` |
| `compression` | `gzip` \| `zip` \| `none` |
| `schedule` | Default `weekly` |
| `enabled` | `1` or `0` |
| `lastdownload` | ISO UTC of last attempt |
| `laststatus` | `ok` or error code (e.g. `http_403`, `missing_feedurl`) |
| `lastsize` | Bytes of last successful body |
| `lastmod` | ISO UTC last metadata change |

**Forbidden:** `stripeaccountid`, `stripecustomerid`, and any `stripe*` key.
Normalizers throw `stripe_fields_forbidden`.

## Weekly job

1. EventBridge rule `rate(7 days)` invokes Lambda `a-search-affiliates-weekly`.
2. Lambda lists provider markers, then affiliate markers under each.
3. For `enabled=1`, downloads `feedurl` via injectable `fetch`, writes dated
   parts file + `latest.{ext}`, updates `lastdownload` / `laststatus` /
   `lastsize` / `lastmod` while preserving other keys.
4. One affiliate failure does not stop others. Logs include **affiliate id**
   only --- never URLs with keys, never login values (`redactForLog`).
5. Retention: delete dated parts beyond last N=4; lifecycle is backup.

IAM on the Lambda role: `s3:GetObject`, `PutObject`, `ListBucket`,
`DeleteObject` on `a-affiliates` / `a-affiliates/*` only. No a-clubs, no madeira.

## Synth / deploy

```bash
npm ci
npm run stage-affiliates
npx cdk synth --app "node cdk/bin/affiliates.js" AAffiliates \
  -c account=620257466932 -c region=eu-west-2

npx cdk deploy --app "node cdk/bin/affiliates.js" AAffiliates \
  -c requireDeployEnv=true \
  -c account=620257466932 -c region=eu-west-2
```

Or: `npm run synth:affiliates` / `npm run deploy:affiliates`.

`cdk diff` for this app should show **only** new `AAffiliates` resources.

## Code map

| Path | Role |
|------|------|
| `shared/affiliates/keys.js` | Slug + key path helpers |
| `shared/affiliates/metadata.js` | Normalize/validate; `redactForLog` |
| `shared/affiliates/retention.js` | Pick dated keys beyond N |
| `affiliates/src/downloadOne.js` | One affiliate download + meta + retain |
| `affiliates/src/runWeekly.js` | Orchestration |
| `affiliates/src/handler.js` | Lambda entry |
| `affiliates/src/memoryS3.js` | In-memory S3 for tests |
| `cdk/lib/affiliates-stack.js` | Stack |
| `cdk/bin/affiliates.js` | App entry (`resolveDeployEnv`) |
| `scripts/stage-affiliates-lambda-asset.js` | Stage Lambda asset |

## Out of scope

- Parsing feeds into search candidates (walrus / SQS; parent #3944).
- Onboarding UI (seed markers by hand or a small script).
- Adding `a-affiliates` to the walrus-rclone IAM user (raise with ops after deploy
  if the bucket is not named `a-search-affiliates`).
