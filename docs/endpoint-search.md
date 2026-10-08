# Endpoint: accept search (LOCKED shape)

Processing is offline. This call validates JWT + body, assigns `searchId`,
and enqueues one SQS message per **enabled** registry source. The **user
identifier comes from the JWT**, never from a trusted body field. Offline
workers use that same id when writing results to S3.

## Request

```
POST /search
Authorization: Bearer <jwt>
Content-Type: application/json
```

### Auth (LOCKED)

| Rule | Detail |
|------|--------|
| Scheme | `Authorization: Bearer <jwt>` from the login issuer |
| User id | Taken from JWT claim **`userId`** (string). This value is the search principal and the S3 partition key for results |
| Body `userId` | **Not accepted** as authority. If present and differs from JWT `userId` -> **401/403**. Prefer omitting it from the body |
| Missing / invalid / expired JWT | **401** `{ "accepted": false, "error": "unauthorized" }` -- no enqueue |
| Missing `userId` claim | **401** `{ "accepted": false, "error": "missing_user_id_claim" }` |

Issuer / JWKS URL / audience: configure via `entry/.env` (`JWT_ISSUER`,
`JWT_AUDIENCE`, `JWT_JWKS_URL` or shared secret) -- values UNKNOWN until deploy.

### Body

```json
{
  "q": "noise cancelling headphones",
  "searchterms": ["noise cancelling", "wireless"],
  "catalogId": 123,
  "category": "Electronics",
  "subcategory": "Headphones",
  "sources": ["amazon", "ebay", "awin"],
  "sandbox": false
}
```

| Field | Required | Type | Meaning |
|-------|----------|------|---------|
| `q` | one of `q` or `searchterms` | string | Primary search text |
| `searchterms` | one of `q` or `searchterms` | string[] | Extra/alternate terms (legacy Madeira shape) |
| `catalogId` | yes | string \| number | **`Catalog.ID`** (`int`) of a `dbo.Catalog` row owned by the JWT `userId` (`Catalog.UserId`). Not a free-form club string -- see [catalog-model.md](catalog-model.md). |
| `category` | yes | string | `Catalog.MainCategory` for that catalog row |
| `subcategory` | yes | string | `Catalog.SubCategory` for that catalog row |
| `sources` | no | string[] | Optional subset of **already enabled** registry ids; omit = all enabled |
| `sandbox` | no | boolean | `true` -> **sandbox** env; `false`/omit -> **live** |

Do **not** send `userId` in the body; it is derived from the JWT.

Environment isolation (queues, SQL, result paths): `docs/environments.md`.

`sources` may not turn on a disabled registry entry.

## Success response

```
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "searchId": "srch_01JEXAMPLE",
  "accepted": true,
  "userId": "ABC12345",
  "env": "live",
  "enqueued": ["amazon", "ebay", "awin", "rakuten", "cj", "impact"]
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `searchId` | string | Correlation id for offline workers |
| `accepted` | true | Job accepted; products are not in this response |
| `userId` | string | Echo of JWT `userId` (results path principal) |
| `env` | `"live"` \| `"sandbox"` | Environment stamped on the job |
| `enqueued` | string[] | Source ids that received an SQS message |

Empty registry (nothing enabled): still **200** with `enqueued: []`.

## SQS message (offline workers)

Each enqueued message includes at least:

```json
{
  "searchId": "srch_01JEXAMPLE",
  "userId": "ABC12345",
  "env": "live",
  "catalogId": 123,
  "category": "Electronics",
  "subcategory": "Headphones",
  "q": "noise cancelling headphones",
  "searchterms": ["noise cancelling", "wireless"],
  "source": "amazon",
  "sandbox": false
}
```

`userId` is copied from the verified JWT by the entry Lambda -- workers must
not invent or trust a different user id. Workers must refuse messages whose
`env` does not match process `A_SEARCH_ENV`.

## Results path (LOCKED) -- S3 + rclone on SQL server

Logical object key:

```
{env}/{source}/{userId}/{catalogId}/{searchId}.json
```

S3 example:

```
s3://{S3_RESULTS_BUCKET}/live/amazon/ABC12345/123/srch_01JEXAMPLE.json
```

On the **same server that hosts MSSQL**, that bucket (or prefix) is mounted
with **rclone as a mapped drive**. Ops/SQL-side tools read the same tree:

```
S:\a-search\live\amazon\ABC12345\123\srch_01JEXAMPLE.json
S:\a-search\sandbox\amazon\ABC12345\123\srch_01JEXAMPLE.json
```

(Drive letter / mount path UNKNOWN until deploy; live and sandbox roots must
differ.) Workers may write via S3 API; the SQL host consumes via the mount.
`searchId` prevents concurrent searches for the same user/catalog from
clobbering each other.

## Error responses

### 401 Unauthorized

```json
{
  "accepted": false,
  "error": "unauthorized"
}
```

### 400 Bad Request

```json
{
  "accepted": false,
  "error": "missing_required_field",
  "fields": ["q"]
}
```

No SQS fan-out on 4xx/401.

## Example (curl)

```bash
curl -sS -X POST "https://<api-host>/search" \
  -H "Authorization: Bearer <jwt-from-login>" \
  -H "Content-Type: application/json" \
  -d '{
    "q": "noise cancelling headphones",
    "catalogId": 123,
    "category": "Electronics",
    "subcategory": "Headphones"
  }'
```

## Not in this response

Product hits -- written later under the S3 path above by offline workers.
