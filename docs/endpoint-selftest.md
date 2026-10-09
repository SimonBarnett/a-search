# Endpoint: provider selftest (FR-059a)

HTTP **selftest** so an agent or operator can ask which **enabled** providers
are healthy for the requested **live|sandbox** env. Failures **file intake**
to bobiverse with `repo=SimonBarnett/a-search`.

Implementation is a later FR-059 slice; this doc locks auth, env, response
shape, and the intake-on-fail rule. Do **not** treat this as a substitute for
`POST /search` product fan-out.

## Request

Preferred:

```
GET /selftest?sandbox=false
Authorization: Bearer <jwt>
```

Also allowed:

```
POST /selftest
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{
  "sandbox": false,
  "sources": ["amazon", "ebay", "awin"]
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
| `sandbox` | no | boolean | `true` → **sandbox** env; `false`/omit → **live** |
| `sources` | no | string[] | Optional subset of **already enabled** registry ids; omit = all enabled for env |
| `userId` | — | — | **Ignored as authority** (see Auth) |

Environment isolation: `docs/environments.md`. Live and sandbox selftests
never share queues, SQL targets, or secrets. Local MSSQL probes that cannot
reach `madeiradb` report `mssql_unreachable` (or `mssql_auth_failed`); the
AWS -> IONOS path decision surface is **Network path (FR-122)** in
`docs/environments.md` (ops checklist — this FR does not open firewall ports).

`sources` may not turn on a disabled registry entry.

## Success response

```
HTTP/1.1 200 OK
Content-Type: application/json
```

Even when some providers fail checks, prefer **200** with per-provider
status (so agents can parse the table). Use **5xx** only when the selftest
runner itself cannot start (e.g. registry unloadable).

```json
{
  "ok": true,
  "userId": "ABC12345",
  "env": "live",
  "providers": [
    { "id": "amazon", "ok": true },
    { "id": "ebay", "ok": false, "error": "browse_api_unreachable" },
    { "id": "awin", "ok": true }
  ],
  "failed": ["ebay"],
  "intakeFiled": ["ebay"]
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `ok` | boolean | `true` when the selftest **runner** completed; may still list failed providers |
| `userId` | string | Echo of JWT `userId` |
| `env` | `live` \| `sandbox` | Env that was probed |
| `providers` | array | One row per checked source (enabled ∩ optional `sources`) |
| `providers[].id` | string | Registry source id |
| `providers[].ok` | boolean | That provider’s probe passed |
| `providers[].error` | string? | Short machine-safe reason when `ok` is false (no secrets) |
| `failed` | string[] | Ids where `ok` is false |
| `intakeFiled` | string[] | Ids for which an intake issue was filed this run (deduped) |

### Provider status (required)

The response **must** list provider status (at least `id` + `ok`) for every
source checked. Agents use this table to decide which workers to trust before
a catalogue enrich.

## Intake on fail (CAST IRON)

When a provider probe **fails**, the selftest **files intake** via the
bobiverse intake webhook:

- `POST https://irc.ntsa.uk/bob/v1/intake`
- Explicit **`repo=SimonBarnett/a-search`** (same as `docs/intake-on-exception.md`)
- `kind: issue` (or `fr` when ops prefer a follow-on FR)
- Title/body: provider id, env, short error code — **no** JWTs, secrets, or
  connection strings (`shared/intake/redact.js`)
- Deduplicate per `provider|env|error` so a flapping probe does not spam

Auth/validation failures on the selftest request itself (**401** / **400**)
do **not** file intake.

## Errors

| Status | Meaning | Agent action |
|--------|---------|--------------|
| 401 | Missing/invalid JWT or missing `userId` claim | Re-login; no intake |
| 400 | Validation (`fields` lists bad keys) | Fix query/body; no intake |
| 5xx | Selftest runner fault | Back off; expect intake from exception path (FR-048) |

## Related

- `docs/endpoint-search.md` — `POST /search` accept
- `docs/endpoint-performance.md` — clicks / visits / sales
- `docs/intake-on-exception.md` — fatal intake wiring
- `docs/environments.md` — live/sandbox isolation
- `.grok/skills/a-search-endpoint/SKILL.md` — agent caller playbook

## Out of scope here

- Implementing the Lambda/route (later FR-059 slices)
- Live vendor load / soak testing
- Changing registry enable flags
