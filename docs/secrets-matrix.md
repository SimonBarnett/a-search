# Secrets matrix (a-search)

Which Lambda needs which secret keys. **No secret values** in this file.

Full JWT row depth is FR-136; MSSQL detail is FR-137; provider credentials
pattern is **FR-138**. FR-150 may expand layout/cross-links.

## Entry

| Key family | Source | Status |
|------------|--------|--------|
| `JWT_*` | Secrets Manager / SSM (FR-136) | **No** — open FR-136 (#972) |

Entry must never hold provider marketplace credentials.

## Results bucket

| Key | Source | Status |
|-----|--------|--------|
| `S3_RESULTS_BUCKET` | CDK bucket name + `grantReadWrite` (FR-130) | Yes |

## MSSQL (local workers + maintainer + onboarding)

| Keys | Source | Lambdas | Status |
|------|--------|---------|--------|
| `SERVER` / `USER` / `PASSWORD` (JSON) → `MSSQL_*` | `-c mssqlSecretArn` (FR-137) | maintainer live/sandbox; `providers/local/*` workers; awin/impact onboarding | Yes |
| `MSSQL_DATABASE` | plain CDK context (live `madeiradb`) | same | Yes |

Live marketplace workers do **not** receive `MSSQL_*`.

## Provider credentials (FR-138) — enabled only

Per-source Secrets Manager JSON. Deploy override:
`-c amazonProviderSecretArn=arn:...` (same pattern for each id).
Synth uses `000000000000` placeholder ARNs with a complete 6-char suffix.

| Source | Secret JSON keys (env names) | Lambdas granted | Stay-dark |
|--------|------------------------------|-----------------|-----------|
| amazon | `AMAZON_ACCESS_KEY`, `AMAZON_SECRET_KEY`, `AMAZON_PARTNER_TAG` | `a-search-amazon-worker-{live,sandbox}` | — |
| ebay | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_REFRESH_TOKEN`, `EBAY_CAMPAIGN_ID` | `a-search-ebay-worker-{live,sandbox}` | — |
| rakuten | `RAKUTEN_APPLICATION_KEY`, `RAKUTEN_AFFILIATE_ID`, `RAKUTEN_SITE_ID` | `a-search-rakuten-worker-{live,sandbox}` | — |
| cj | `CJ_API_TOKEN`, `CJ_COMPANY_ID`, `CJ_WEBSITE_ID` | `a-search-cj-worker-{live,sandbox}` | — |
| awin | `AWIN_API_TOKEN`, `AWIN_PUBLISHER_ID` | workers + awin onboarding live/sandbox | — |
| impact | `IMPACT_CAMPAIGN_ID`, `IMPACT_ACCOUNT_SID`, `IMPACT_AUTH_TOKEN` | workers + impact onboarding live/sandbox | — |

**Stay-dark omitted** (no secret construct / IAM grant until enable-provider FR):
kelkoo, skimlinks, aliexpress, etsy, bol, partnerize, webgains, tradedoubler,
admitad, flexoffers, avantlink, shopify, wix, woocommerce.

Public non-secret defaults (`AMAZON_HOST`, `EBAY_MARKETPLACE_ID`, endpoints)
are plain CDK env — not Secrets Manager.

## Pin

- `tests/fr138-provider-secrets-cdk.test.js` — only enabled sources get grants
- `tests/fr137-mssql-secrets-cdk.test.js` — MSSQL local-only
