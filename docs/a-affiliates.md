# a-affiliates (FR #3999 / #4195)

Private S3 bucket and **daily** Lambda for affiliate network **provider login**
and **affiliate feed** downloads. Deployed as standalone CDK stack `AAffiliates`
(`cdk/bin/affiliates.js`). Does **not** modify `ASearchStack`, `APartsGateway`,
`a-clubs`, or madeira resources.

## Why Lambda (not Fargate)

v1 uses a **Node 20 Lambda** (15 min timeout, EventBridge `rate(1 day)`). The
job skips affiliates fresher than `refreshdays` (default **7**). Fargate is a
documented follow-up if feeds exceed Lambda time or ephemeral storage limits.

## Bucket

| Property | Value |
|----------|--------|
| Name (code/outputs) | `a-affiliates` |
| Fallback if global name taken | `a-search-affiliates` (ops records real name in outputs) |
| Public access | Block all (`BlockPublicAccess.BLOCK_ALL`) |
| Transport | `enforceSSL: true` (deny insecure) |
| Encryption | SSE-S3 (`BucketEncryption.S3_MANAGED`) |
| Removal | `RemovalPolicy.RETAIN`, `autoDeleteObjects: false` |
| Lifecycle | Expire objects with size > 0 after 35 days (safety net; zero-byte markers kept). Import deletes feeds after DB load. |

Account/region target: `620257466932` / `eu-west-2` (same as other a-search stacks).

## Key layout (FR #4195)

Zero-byte marker objects carry S3 **user metadata** (name/value pairs), same idea
as a-clubs host/GUID markers. Feeds are **one decompressed object** in the
merchant folder (no `parts/`, no `latest`, no retention copies).

```
a-affiliates/
  {provider}/                              # marker key `{provider}/`
  {provider}/provider.json                 # optional overflow when metadata > 2 KiB
  {provider}/{affiliateid}/                # marker key `{provider}/{affiliateid}/`
  {provider}/{affiliateid}/{yyyy-mm-dd}.{ext}   # decompressed feed (format = ext)
```

Provider slug and `affiliateid` must match `[a-z0-9._-]+` (lower-case).

`{ext}` is the affiliate/provider `format` (`csv` \| `tsv` \| `xml` \| `json`).
Source `compression` (`gzip` \| `zip` \| `none`) is applied only while fetching;
stored objects are always plain. Content-Type is `text/csv; charset=utf-8` (etc.).

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
| `feedapikey` / `darwinhash` | Feed URL placeholder secrets (**secret**) |
| `authtype` | `password` \| `token` \| `oauth` |
| `enabled` | `1` or `0` (skip whole provider when `0`) |
| `refreshdays` | Days before re-download (default `7`) |
| `format` / `compression` | Defaults for affiliates missing their own |
| `lastmod` | ISO UTC last metadata change |

If the combined user-metadata payload exceeds ~2 KiB, put overflow JSON at
`{provider}/provider.json` (same secret rules). Helpers expose
`METADATA_SOFT_MAX_BYTES` and `providerJsonKey`.

## Affiliate metadata keys (`{provider}/{affiliateid}/`)

Everything needed to download that affiliate's feed. Affiliates pay
**commission** --- there are **no** Stripe fields.

| Key | Notes |
|-----|--------|
| `affiliateid` | Lower-case slug id |
| `name` | Display name |
| `feedurl` | Direct feed URL (may keep `{feedapikey}` placeholders; never store secrets) |
| `feedid` | Alternate: provider feed id (+ template) |
| `format` | `csv` \| `tsv` \| `xml` \| `json` |
| `compression` | Source feed: `gzip` \| `zip` \| `none` |
| `schedule` | Default `daily` |
| `enabled` | `1` or `0` |
| `lastdownload` | ISO UTC of last attempt |
| `lastok` | ISO UTC of last **successful** download (refresh clock) |
| `laststatus` | `ok`, `exists`, `unsupported_*`, `decompress_error`, `http_*`, ... |
| `lastsize` | Bytes of last successful **decompressed** body |
| `lastmod` | ISO UTC last metadata change |

**Forbidden:** `stripeaccountid`, `stripecustomerid`, and any `stripe*` key.
Normalizers throw `stripe_fields_forbidden`.

## Daily job (FR #4195)

1. EventBridge rule `rate(1 day)` invokes Lambda `a-search-affiliates-weekly`
   (legacy name; behaviour is daily).
2. Lambda lists enabled provider markers (paginated), then affiliate markers.
3. Downloads when `lastok` (or `lastdownload` with `laststatus=ok`) is missing or
   older than `refreshdays`. Failures do **not** move `lastok`.
4. Writes `{provider}/{affiliateid}/{yyyy-mm-dd}.{ext}` only; skips with
   `exists` when today's file is present (unless force). Older dated files are
   left for import to delete.
5. One affiliate failure does not stop others. Logs include **affiliate id**
   only --- never URLs with keys, never login values (`redactForLog`).
6. Optional `onImport` hook fires after the run (linked import FR).

Manual `/tools download` is what the affiliate agent runs on first folder
create; same flat key layout and `-Force` overwrite.

IAM on the Lambda role: `s3:GetObject`, `PutObject`, `ListBucket`,
`DeleteObject` on `a-affiliates` / `a-affiliates/*` only. No a-clubs, no madeira.

## Synth / deploy

```powershell
npm run synth:affiliates
npm run deploy:affiliates
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

## Daily Awin onboarding agent (FR #4123)

On **redqueen**, `redqueen/awin-agent/` recreates Merc's Awin publisher
onboarding: invite/join, approvals, feed links, and merge-writes to
`a-affiliates/awin/{advertiserid}/` only. See `redqueen/awin-agent/README.md`
(schedule, Grok-then-Cursor runtime, `-DryRun`, credentials file contract,
report path, skillbooks). Feed download remains #3999 / #4108; DB import #4001.

## Daily Rakuten signup agent (FR #4701)

Provider-aware entry: `tools/agent.ps1` or `redqueen/affiliate-agent/src/run.js`
from cwd `S:\a-affiliates\rakuten` (same pattern as Awin under `...\awin`).
Applications and approvals only --- **no** Rakuten SQL download folders or
feeds. Records live at `rakuten/_applications/{mid|slug}/`. Schedule:
`Register-AffiliateAgentTask.ps1 -Provider rakuten` (06:30 daily; does not
alter `a-search-awin-agent`). Seed docs under
`redqueen/affiliate-agent/seed/a-affiliates/`. See
`redqueen/affiliate-agent/README.md`.

## Provider AGENT.md --- Download format (FR #4208 / #4195)

Live playbooks live in S3 (not the git tree): `s3://a-affiliates/{provider}/AGENT.md`
plus root `s3://a-affiliates/AGENTS.md`. Repo has no AGENT.md copies.

Each provider `AGENT.md` must include a contiguous markdown heading
`## Download format` that states what the network delivers when known
(e.g. Awin: CSV + gzip), otherwise tells the agent to set `format` /
`compression` on the marker. Shared bullets under that heading cover:

- Marker values: `format` = `csv` | `tsv` | `xml` | `json`; `compression` =
  `gzip` | `zip` | `none` (affiliate marker wins, else provider marker).
- Download writes one decompressed object
  `{provider}/{affiliateid}/{yyyy-mm-dd}.{ext}` (no `parts/`, no `latest`).
- Unknown format/compression -> `unsupported_*` status and zero writes.

Verified on live bucket 2026-10-18 for: awin, impact, partnerize, webgains,
tradedoubler, admitad, flexoffers, avantlink. Root `AGENTS.md` points at the
per-provider "Download format" section for the `format` metadata key.

## Out of scope

- Parsing feeds into search candidates (walrus / SQS; parent #3944).
- Adding `a-affiliates` to the walrus-rclone IAM user (raise with ops after deploy
  if the bucket is not named `a-search-affiliates`).
