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
`EntryJwtSecret` with JSON placeholder `GenerateSecretString` (FR-3945) so
CloudFormation `:SecretString:JWT_*` refs resolve on first deploy; ops then
replace placeholders. Entry gets `grantRead` on that secret only.

Entry must **never** hold provider marketplace credentials.

## Results bucket (not a secret string)

| Key | Source | Lambdas |
|-----|--------|---------|
| `S3_RESULTS_BUCKET` | CDK bucket name + `grantReadWrite` (FR-130) | entry, all enabled workers, maintainer, onboarding |

## MSSQL (FR-137) - on-box walrus (FR-3948); legacy Lambda row superseded

**New stack (FR-3948 / FR-122 LOCKED C):** AWS Lambdas do **not** receive
`MSSQL_*` and deploy does **not** pass `-c mssqlSecretArn`. DB credentials live
on **walrus** only (ops secret store / integrated auth). Live writers use
`MSSQL_DATABASE=a_search` (FR-251); sandbox uses `a_search_sandbox`. madeiradb
stays read-only.

**Legacy Lambda wiring** (old stacks; string kept for pins):

| Secret JSON key | Env | Notes |
|-----------------|-----|-------|
| `SERVER` | `MSSQL_SERVER` | |
| `USER` | `MSSQL_USER` | |
| `PASSWORD` | `MSSQL_PASSWORD` | |
| (optional) `TRUSTED_CONNECTION` / `DOMAIN` | same names if present | |

| Plain (not Secrets Manager) | Value |
|-----------------------------|-------|
| `MSSQL_DATABASE` | live **`a_search`** (FR-251); sandbox from CDK context / placeholder. Never live `madeiradb` for writers. |

Deploy (legacy only): `-c mssqlSecretArn=arn:...` (complete ARN). **Omit for the
new stack.** Live marketplace workers (amazon/ebay/rakuten/cj) do **not**
receive `MSSQL_*`.

Enabled local workers historically: **awin**, **impact** (plus maintainer and
awin/impact onboarding Lambdas) --- moving on-box under FR-3948 sibling FRs.

## Provider credentials (FR-138) - enabled sources only

Enabled live providers do not use Secrets Manager. Deploy bundles
`providers/live/<id>/.env` into that worker Lambda. The worker reads the file
at run time. Amazon and eBay files are filled from kebab-case
`/madeira/amazon/{access-key,secret-key,associate-tag,host,region}` and
`/madeira/ebay/{client-id,client-secret,campaign-id,marketplace-id}` SSM
parameters (`refresh-token` optional; values are not printed). A missing `.env`
fails deploy and names the file only. Rakuten reads `RAKUTEN_CLIENT_ID`,
`RAKUTEN_CLIENT_SECRET`, and `RAKUTEN_SID`, then exchanges them for a short-lived
token. `EBAY_ENV` still comes from the stack env (live means production).

| Source | Keys (become env names) | Lambdas |
|--------|-------------------------|---------|
| amazon | env file: `AMAZON_ACCESS_KEY`, `AMAZON_SECRET_KEY`, `AMAZON_PARTNER_TAG`, `AMAZON_HOST`, `AMAZON_REGION` | `a-search-amazon-worker-{live,sandbox}` |
| ebay | env file: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_CAMPAIGN_ID`, `EBAY_MARKETPLACE_ID` (`EBAY_REFRESH_TOKEN` optional) | `a-search-ebay-worker-{live,sandbox}` |
| rakuten | bundled `.env`: `RAKUTEN_CLIENT_ID`, `RAKUTEN_CLIENT_SECRET`, `RAKUTEN_SID`, `RAKUTEN_SITE_ID` | `a-search-rakuten-worker-{live,sandbox}` |
| cj | `CJ_API_TOKEN`, `CJ_COMPANY_ID`, `CJ_WEBSITE_ID` | `a-search-cj-worker-{live,sandbox}` |
| awin | `AWIN_API_TOKEN`, `AWIN_PUBLISHER_ID` | workers + awin onboarding live/sandbox |
| impact | `IMPACT_CAMPAIGN_ID`, `IMPACT_ACCOUNT_SID`, `IMPACT_AUTH_TOKEN` | workers + impact onboarding live/sandbox |
| kelkoo | `KELKOO_API_KEY`, `KELKOO_PUBLISHER_ID` | `a-search-kelkoo-worker-{live,sandbox}` (FR-167); plain `KELKOO_COUNTRY=uk` |
| skimlinks | `SKIMLINKS_API_KEY`, `SKIMLINKS_PUBLISHER_ID` | `a-search-skimlinks-worker-{live,sandbox}` (FR-168); plain `SKIMLINKS_COUNTRY=uk` |
| aliexpress | `ALIEXPRESS_API_KEY` | `a-search-aliexpress-worker-{live,sandbox}` (FR-169); plain `ALIEXPRESS_TRACKING_ID=a-search` |
| shopify | worker | SHOPIFY_API_KEY, SHOPIFY_API_SECRET_KEY, SHOPIFY_ACCESS_TOKEN, SHOPIFY_STORE_URL | Secrets Manager JSON (`a-search/{env}/providers/shopify/app` + selftest fallback) |
| woocommerce | `WOOCOMMERCE_CONSUMER_KEY`, `WOOCOMMERCE_CONSUMER_SECRET`, `WOOCOMMERCE_STORE_URL` | `a-search-woocommerce-worker-{live,sandbox}` (FR-180) |
| avantlink | `AVANTLINK_API_KEY`, `AVANTLINK_API_TOKEN`, `AVANTLINK_FEED_TOKEN`, `AVANTLINK_PUBLISHER_ID`, `AVANTLINK_AFFILIATE_ID` | `a-search-avantlink-worker-{live,sandbox}` (FR-177) |
| etsy | env file: `ETSY_API_KEY` (`ETSY_SHARED_SECRET` optional when the key is `key:secret`) | `a-search-etsy-worker-{live,sandbox}` (FR-170/FR-244 / FR #4439); plain `ETSY_AFFILIATE_NETWORK=rakuten` |
| bol | `BOL_API_KEY` | `a-search-bol-worker-{live,sandbox}` (FR-171); plain `BOL_TRACKING_ID=a-search` |
| partnerize | `PARTNERIZE_API_KEY`, `PARTNERIZE_API_TOKEN`, `PARTNERIZE_FEED_TOKEN`, `PARTNERIZE_PUBLISHER_ID` | `a-search-partnerize-worker-{live,sandbox}` (FR-172) |
| tradedoubler | `TRADEDOUBLER_API_KEY`, `TRADEDOUBLER_API_TOKEN`, `TRADEDOUBLER_FEED_TOKEN`, `TRADEDOUBLER_AFFILIATE_ID`, `TRADEDOUBLER_PUBLISHER_ID` | `a-search-tradedoubler-worker-{live,sandbox}` (FR-174) |
| webgains | `WEBGAINS_API_KEY`, `WEBGAINS_API_TOKEN`, `WEBGAINS_FEED_TOKEN`, `WEBGAINS_PUBLISHER_ID`, `WEBGAINS_CAMPAIGN_ID` | `a-search-webgains-worker-{live,sandbox}` (FR-173) |
| wix | `WIX_CLIENT_ID`, `WIX_API_TOKEN`, `WIX_SITE_ID`, `WIX_STORE_URL` | `a-search-wix-worker-{live,sandbox}` (FR-179 merchant); plain `WIX_API_BASE` |

**Stay-dark omitted** (no secret construct / IAM grant until enable-provider FR):
admitad, flexoffers.

`AMAZON_HOST`, `AMAZON_REGION` and `EBAY_MARKETPLACE_ID` come from the amazon
and ebay env files. Other public defaults (endpoints) stay plain CDK env.

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
