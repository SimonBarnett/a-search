# Endpoint: account performance (FR-053a)

Second HTTP API (alongside `POST /search`) so an agent can query
**clicks / visits / sales** for the JWT account. Implementation is FR-053b+;
this doc locks auth, fields, and env.

Read model sources (when wired): MSSQL transaction/click tables and/or the
local↔S3 mapping service (FR-054). Empty accounts return **200** with zeros /
empty arrays — not 404.

## Request

Preferred (LOCKED for stubs):

```
GET /account/performance?from=2026-10-01&to=2026-10-08&sandbox=false
Authorization: Bearer <jwt>
```

Also allowed:

```
POST /account/performance
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{
  "from": "2026-10-01",
  "to": "2026-10-08",
  "sandbox": false
}
```

### Auth (LOCKED — same rules as search)

| Rule | Detail |
|------|--------|
| Scheme | `Authorization: Bearer <jwt>` from the login issuer |
| User id | Taken **only** from JWT claim **`userId`** (string) |
| Body / query `userId` | **Not accepted** as authority. If present and differs from JWT `userId` → **401/403**. Prefer omitting it |
| Missing / invalid / expired JWT | **401** `{ "ok": false, "error": "unauthorized" }` |
| Missing `userId` claim | **401** `{ "ok": false, "error": "missing_user_id_claim" }` |

Issuer / JWKS / audience: same `entry/.env` keys as search
(`JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_JWKS_URL` or shared secret) — values
UNKNOWN until deploy.

### Query / body filters

| Field | Required | Type | Meaning |
|-------|----------|------|---------|
| `from` | no | string (`yyyy-MM-dd`) | Inclusive start (UTC calendar day) |
| `to` | no | string (`yyyy-MM-dd`) | Inclusive end (UTC calendar day) |
| `sandbox` | no | boolean | `true` → **sandbox** env; `false`/omit → **live** |
| `currency` | no | string | Optional filter (e.g. `GBP`) |
| `userId` | — | — | **Ignored as authority** (see Auth) |

Default date range when omitted: last **7** UTC days ending today (implementation
may document exact window in FR-053c+).

Environment isolation: `docs/environments.md`. Live and sandbox never share
click/sale rows.

## Success response

```
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "ok": true,
  "userId": "ABC12345",
  "env": "live",
  "from": "2026-10-01",
  "to": "2026-10-08",
  "clicks": 0,
  "visits": 0,
  "uniqueVisitors": 0,
  "sales": {
    "count": 0,
    "amount": 0,
    "commission": 0,
    "currency": "GBP"
  },
  "currencies": [],
  "topLinks": [],
  "topMerchants": []
}
```

### Field table

| Field | Type | Meaning |
|-------|------|---------|
| `ok` | true | Request authorised; payload is for JWT `userId` only |
| `userId` | string | Echo of JWT **`userId`** |
| `env` | `"live"` \| `"sandbox"` | Environment for the read |
| `from` / `to` | string | Effective date range (`yyyy-MM-dd`, UTC) |
| `clicks` | number | Click count in range |
| `visits` | number | Visit count in range |
| `uniqueVisitors` | number | Unique visitors in range |
| `sales.count` | number | Conversion / sale count |
| `sales.amount` | number | Sale amounts (sum; currency in `sales.currency` or breakdown) |
| `sales.commission` | number | Commission amounts |
| `sales.currency` | string | Primary currency when single-currency |
| `currencies` | array | Optional per-currency `{ currency, amount, commission, count }` |
| `topLinks` | array | Optional `{ linkId, clicks, sales, … }` |
| `topMerchants` | array | Optional `{ merchantId, merchantName, clicks, sales, … }` |

**Sales must appear in the schema** (zeros when none). Do not omit the
`sales` object.

## Error responses

| Case | Status | Body (shape) |
|------|--------|--------------|
| No / bad JWT | **401** | `{ "ok": false, "error": "unauthorized" }` |
| Missing `userId` claim | **401** | `{ "ok": false, "error": "missing_user_id_claim" }` |
| Body `userId` ≠ JWT | **401** or **403** | `{ "ok": false, "error": "user_id_mismatch" }` |
| Bad `from`/`to` | **400** | `{ "ok": false, "error": "invalid_date_range" }` |

## Agent skill

Caller playbook: `.grok/skills/a-search-endpoint/SKILL.md` (points here).
Search accept path remains `docs/endpoint-search.md`.

## Related

- Parent: `docs/fr/FR-053.md`
- Phase-1b Q6: `docs/feature-request-phase1b-2026-10-07.md`
- Mapping store (read model): FR-054
- Mock UI (optional): `docs/mocks/performance.html` when filed
