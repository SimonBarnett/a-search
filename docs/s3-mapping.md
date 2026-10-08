# S3 / local mapping schema (FR-054a)

Durable **local↔S3 mapping** records connect affiliate tokens / click refs to
result object keys so the performance endpoint (FR-053) and ops tools can
resolve link stats without scanning the whole results tree.

**Implementation is out of scope for FR-054a** (modules, writers, and store
wiring are FR-054b+). This doc locks the **record fields** and **store
choice**.

Fail-when: mapping held only in Lambda memory (lost across invokes).

## Record schema (LOCKED)

Each mapping row / JSON object:

| Field | Required | Type | Meaning |
|-------|----------|------|---------|
| `env` | yes | `"live"` \| `"sandbox"` | Environment isolation key — never mix |
| `userId` | yes | string | Tenant from JWT `userId` (search accept) |
| `source` | yes | string | Registry id (`amazon`, `awin`, `impact`, …) |
| `token` / `tokenOrClickRef` | yes | string | Affiliate token, click id, or deep-link ref used to join stats |
| `s3Key` | yes | string | Results object key (see `docs/rclone-results.md` / `shared/resultsPath.js`) |
| `searchId` | no | string | Accept-time search id when known |
| `catalogId` | no | string | Catalog / programme id when known |
| `createdAt` | no | string (ISO-8601) | When the mapping was first written |
| `meta` | no | object | Optional provider-specific extras (no secrets) |

**Minimum fields for Testable / readers:** `env`, `userId`, `source`, `token`
(alias `tokenOrClickRef`), `s3Key`.

Canonical example:

```json
{
  "env": "live",
  "userId": "ABC12345",
  "source": "amazon",
  "tokenOrClickRef": "clk_01JEXAMPLE",
  "token": "clk_01JEXAMPLE",
  "s3Key": "live/amazon/ABC12345/123/srch_01JEXAMPLE.json",
  "searchId": "srch_01JEXAMPLE",
  "catalogId": "123",
  "createdAt": "2026-10-08T12:00:00.000Z",
  "meta": {}
}
```

`token` and `tokenOrClickRef` are the same logical value; writers may emit
either or both. Readers accept both names.

## Store choice (LOCKED — FR-054c)

**LOCKED:** S3 inventory JSON under the results bucket / rclone root:

```text
{env}/_mapping/{userId}/{source}/{tokenHash}.json
```

- `tokenHash` = first 40 hex chars of SHA-256(`tokenOrClickRef`) (safe object name)
- Bucket: `S3_RESULTS_BUCKET` (same family as results / signups)
- Adapter: `shared/mapping/s3Store.js` (`createS3MappingStore`)
- Natural key for upsert/get remains `(env, userId, source, tokenOrClickRef)`

MSSQL table store is **not** used for FR-054c (may be revisited later if
list-by-userId joins demand it). Memory-only / Lambda locals are **forbidden**.

Must:

- Persist across Lambda invokes / new module instances (S3, not process RAM)
- Isolate **live** vs **sandbox** via the `{env}/` prefix
- Support upsert by natural key through `upsertMapping` + `createS3MappingStore`

## Writers / readers (pointers — OOS here)

| Role | Later FR | Intent |
|------|----------|--------|
| Upsert / get API module | FR-054b | `shared/mapping/` or `services/s3-mapping/` |
| Durable backing wire | FR-054c | S3 `{env}/_mapping/...` (**LOCKED**) |
| `writeResults` registers entry | FR-054d | Search result write path |
| List by `userId` for performance | FR-054e | FR-053 read model |
| Live/sandbox isolation test | FR-054f | Rows/prefixes never mix |

## Related

- Parent: `docs/fr/FR-054.md`
- Results key layout: `docs/rclone-results.md`, `shared/resultsPath.js`
- Environments: `docs/environments.md`
- Performance consumer: `docs/endpoint-performance.md` (FR-053)
- Phase-1b Q7: `docs/feature-request-phase1b-2026-10-07.md`
