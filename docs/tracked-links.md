# Tracked / affiliate links (FR-057)

Every link a-search **creates** (affiliate, deep, or tracking URLs written into
results JSON or signup/report payloads) must be built from that provider
folder's `.env` **account** fields, with the Bearer JWT **`userId`** claim as
the **tenant** stamp. Never hardcode publisher IDs or reuse another tenant's
account.

Helper (FR-057a): `shared/links/buildTrackedUrl.js` -> `buildTrackedUrl`.

## Rules (CAST IRON)

| Rule | Detail |
|------|--------|
| Tenant | Always `String(jwtUserId)` from the JWT claim. Reject empty. **Never** take tenant from the request body. |
| Account | Publisher / associate / campaign identifiers come **only** from that provider folder's process env / `.env` (documented in each `.env.example`). |
| Fail closed | Missing required account env -> clear error; do not emit an untracked raw offer URL when a tracked link is required. |
| Isolation | Stamp `a_search_env` when `env` is passed (`live` \| `sandbox`). |
| Secrets | Never commit real account values; placeholders only in `.env.example`. |

Default query param for the tenant is `userId` (overridable via
`tenantParam`). Account env keys map to network query names via
`DEFAULT_ACCOUNT_QUERY_MAP` in the helper (callers may override
`accountQueryMap`).

## Amazon account env (this FR)

| Env key | Query param (default) | Role |
|---------|----------------------|------|
| `AMAZON_PARTNER_TAG` | `tag` | Associates partner / store tag for tracked Amazon URLs |

Documented in `providers/live/amazon/.env.example`. PA-API access/secret keys
are **not** affiliate account stamps for `buildTrackedUrl`; they stay for
SearchItems auth.

## Call shape (reference)

```js
const { buildTrackedUrl } = require('../../shared/links/buildTrackedUrl');

const tracked = buildTrackedUrl({
  url: detailPageUrl,
  userId: jwtUserId, // JWT claim only
  env: message.env,  // live | sandbox
  envVars: process.env,
  requiredAccountKeys: ['AMAZON_PARTNER_TAG'],
});
```



## SQL read-time rewriting (`dbo.Part2`) vs create-time tracking

madeiradb helper **`dbo.Part2`** reads `Products` and rewrites affiliate URLs
when serving SQL results:

| Source key | Rewrite |
|------------|---------|
| `paapi` | `tag=mymodelflying-21` -> `tag=mymodelflying-<lower(UserId)>-21` |
| `awin` | append `&clickref=<UserId>` |

**Do not tag twice.** If a-search already applied `buildTrackedUrl` (JWT
`userId` + provider `.env` account) into S3/results JSON, do not also assume
`Part2` will run on that JSON -- `Part2` is a **SQL** read path over `Products`.
Conversely, rows that only ever surface through `Part2` may rely on that
rewrite; workers writing `Products.AffiliateUrl` should leave placeholders
compatible with `Part2` or document that a-search owns final tagging.

Full catalog/product map: [catalog-model.md](catalog-model.md) (FR-115).

## Out of scope here

- Wiring workers / normalize paths (FR-057c..h)
- Other providers' `.env.example` account rows (later FR-057 slices)
- Vision Success row (FR-057i)
- Changing the JWT issuer
