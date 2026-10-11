# Secrets matrix (FR-150)

Which Lambda needs which secret **keys**. **No secret values** in this file
(never paste passwords, JWTs, or API tokens here or in git).

Cross-links: JWT wiring [FR-136](fr/FR-136.md); MSSQL [FR-137](fr/FR-137.md);
provider credentials [FR-138](fr/FR-138.md); deploy steps [deploy.md](deploy.md).

## Lambda x secret family

| Lambda | JWT_* | Provider JSON | MSSQL_* | S3_RESULTS_BUCKET |
|--------|-------|---------------|---------|-------------------|
| `a-search-entry` | Yes (FR-136) | No | No | Yes (plain name + IAM) |
| `a-search-{amazon,ebay,rakuten,cj}-worker-{live,sandbox}` | No | Yes (own source only) | No | Yes |
| `a-search-{awin,impact}-worker-{live,sandbox}` | No | Yes (own source) | Yes (FR-137) | Yes |
| `a-search-maintainer-{live,sandbox}` | No | No | Yes | Yes |
| `a-search-awin-onboarding-{live,sandbox}` | No | Yes (awin) | Yes | Yes |
| `a-search-impact-onboarding-{live,sandbox}` | No | Yes (impact) | Yes | Yes |

Stay-dark / not-yet-enabled sources get **no** Secrets Manager construct and
**no** IAM grant until an enable-provider FR (see FR-138).

## Entry JWT (FR-136)

| JSON key in Secrets Manager | Env on entry | Notes |
|-----------------------------|--------------|-------|
| `JWT_ISSUER` | `JWT_ISSUER` | Required at runtime |
| `JWT_AUDIENCE` | `JWT_AUDIENCE` | Required at runtime |
| `JWT_JWKS_URL` | `JWT_JWKS_URL` | Prefer for production |
| `JWT_SECRET` | `JWT_SECRET` | HS256 lab/fixtures; optional if JWKS set |
| `JWT_HS256_SECRET` | (optional alias) | Documented for ops; entry may accept alias at runtime |

Deploy: `-c jwtSecretArn=arn:aws:secretsmanager:...:secret:name-XXXXXX`
(complete ARN with 6-char suffix). Omit to let the stack create
`EntryJwtSecret` for ops to fill. Entry gets `grantRead` on that secret only.

Entry must **never** hold provider marketplace credentials.

## Results bucket (not a secret string)

| Key | Source | Lambdas |
|-----|--------|---------|
| `S3_RESULTS_BUCKET` | CDK bucket name + `grantReadWrite` (FR-130) | entry, all enabled workers, maintainer, onboarding |

## MSSQL (FR-137) - local workers + maintainer + onboarding only

| Secret JSON key | Env | Notes |
|-----------------|-----|-------|
| `SERVER` | `MSSQL_SERVER` | |
| `USER` | `MSSQL_USER` | |
| `PASSWORD` | `MSSQL_PASSWORD` | |
| (optional) `TRUSTED_CONNECTION` / `DOMAIN` | same names if present | |

| Plain (not Secrets Manager) | Value |
|-----------------------------|-------|
| `MSSQL_DATABASE` | live `madeiradb`; sandbox from CDK context / placeholder |

Deploy: `-c mssqlSecretArn=arn:...` (complete ARN). Live marketplace workers
(amazon/ebay/rakuten/cj) do **not** receive `MSSQL_*`.

Enabled local workers today: **awin**, **impact** (plus maintainer and
awin/impact onboarding Lambdas).

## Provider credentials (FR-138) - enabled sources only

Per-source Secrets Manager JSON. Override:
`-c amazonProviderSecretArn=arn:...` (same pattern per id). Synth uses
`000000000000` placeholder ARNs with a complete 6-char suffix when omitted.

| Source | Secret JSON keys (become env names) | Lambdas granted |
|--------|-------------------------------------|-----------------|
| amazon | `AMAZON_ACCESS_KEY`, `AMAZON_SECRET_KEY`, `AMAZON_PARTNER_TAG` | `a-search-amazon-worker-{live,sandbox}` |
| ebay | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_REFRESH_TOKEN`, `EBAY_CAMPAIGN_ID` | `a-search-ebay-worker-{live,sandbox}` |
| rakuten | `RAKUTEN_APPLICATION_KEY`, `RAKUTEN_AFFILIATE_ID`, `RAKUTEN_SITE_ID` | `a-search-rakuten-worker-{live,sandbox}` |
| cj | `CJ_API_TOKEN`, `CJ_COMPANY_ID`, `CJ_WEBSITE_ID` | `a-search-cj-worker-{live,sandbox}` |
| awin | `AWIN_API_TOKEN`, `AWIN_PUBLISHER_ID` | workers + awin onboarding live/sandbox |
| impact | `IMPACT_CAMPAIGN_ID`, `IMPACT_ACCOUNT_SID`, `IMPACT_AUTH_TOKEN` | workers + impact onboarding live/sandbox |
| kelkoo | `KELKOO_API_KEY`, `KELKOO_PUBLISHER_ID` | `a-search-kelkoo-worker-{live,sandbox}` (FR-167); plain `KELKOO_COUNTRY=uk` |
| skimlinks | `SKIMLINKS_API_KEY`, `SKIMLINKS_PUBLISHER_ID` | `a-search-skimlinks-worker-{live,sandbox}` (FR-168); plain `SKIMLINKS_COUNTRY=uk` |
| aliexpress | `ALIEXPRESS_API_KEY` | `a-search-aliexpress-worker-{live,sandbox}` (FR-169); plain `ALIEXPRESS_TRACKING_ID=a-search` |
| etsy | `ETSY_API_KEY` | `a-search-etsy-worker-{live,sandbox}` (FR-170); plain `ETSY_TRACKING_ID=a-search` |

**Stay-dark omitted** (no secret construct / IAM grant until enable-provider FR):
bol, partnerize, webgains, tradedoubler,
admitad, flexoffers, avantlink, shopify, wix, woocommerce.

Public non-secret defaults (`AMAZON_HOST`, `EBAY_MARKETPLACE_ID`, endpoints)
are plain CDK env - not Secrets Manager.

## Anti-patterns

- Committing real passwords, JWTs, or API tokens into git or this matrix
- Granting entry read on provider secrets
- Wiring `MSSQL_*` onto live marketplace amazon/ebay/rakuten/cj workers
- Incomplete Secrets Manager ARNs (missing random suffix) - synth fails

## Pins

- `tests/fr150-secrets-matrix.test.js` - this doc + README pointer (FR-150)
- `tests/fr136-jwt-secrets-cdk.test.js` - entry JWT wiring
- `tests/fr137-mssql-secrets-cdk.test.js` - MSSQL local-only
- `tests/fr138-provider-secrets-cdk.test.js` - enabled sources only
