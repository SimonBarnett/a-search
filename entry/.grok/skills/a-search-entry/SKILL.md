---
name: a-search-entry
description: >
  Maintain the a-search HTTP entry package: JWT Bearer verify, POST /search
  accept, registry fan-out to SQS, live vs sandbox. Use in entry/ CWD, for
  entry Lambda debugging, or /a-search-entry. Does not hold provider secrets.
---

# a-search entry (HTTP accept + fan-out)

> **CAST IRON:** Never commit JWTs, JWKS secrets, or provider API keys.
> Entry holds **JWT_* / A_SEARCH_ENV** only. Provider secrets stay in each
> `providers/*/`.env`.

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

You are working in **`entry/`** — the accept path for Club Madeira
affiliate / local-parts search. Processing is offline: this package
returns **HTTP 200** when the job is queued; products appear later under
the results path.

Canonical docs: `docs/endpoint-search.md`, `docs/environments.md`,
`docs/skillbook-layout.md` (FR-046a harvest checklist).

## Responsibilities

| Owns | Does not own |
|------|----------------|
| `POST /search` HTTP handler | Provider workers / API clients |
| JWT Bearer verify → `userId` claim | Provider `.env` secrets |
| Registry load + fan-out enqueue | MSSQL parts maintainer |
| Live vs sandbox stamp on the job | S3 write from providers |

## Auth (LOCKED)

```
POST /search
Authorization: Bearer <jwt>
Content-Type: application/json
```

- Scheme: `Authorization: Bearer <jwt>` from the login issuer.
- Principal: JWT claim **`userId`** (string). This is the search principal
  and the S3 partition key for results.
- Body `userId` is **not** authority. Prefer omitting it; if present and
  different from JWT → 401/403.
- Missing / invalid JWT → **401** `{ "accepted": false, "error": "unauthorized" }`
  (no enqueue).
- Missing `userId` claim → **401** `{ "accepted": false, "error": "missing_user_id_claim" }`.

Configure via `entry/.env` (see `.env.example`): `JWT_ISSUER`,
`JWT_AUDIENCE`, `JWT_JWKS_URL` (or shared secret), `A_SEARCH_ENV`.

## Fan-out

1. Resolve env: body `sandbox: true` → `sandbox`, else `live` (must match
   process `A_SEARCH_ENV` once deployed).
2. Load `providers/registry.json` via `providers/loadRegistry.js`.
3. `enabled(env)` → default-on ids (or intersect with optional body
   `sources` that are already enabled).
4. Assign `searchId`; enqueue one SQS message per enabled source.
5. Respond **200** with `{ searchId, accepted: true, userId, env, enqueued }`.

Empty enabled set: still **200** with `enqueued: []`.

Entry **never** calls provider APIs and **never** reads provider secrets.

## Handler stub

`src/index.js` is a scaffold stub until FR-004 (JWT verify) and FR-005/006
(accept + fan-out) land. Do not invent AWS deploy wiring here.

## Failures (playbook)

| Symptom | Check |
|---------|--------|
| 401 loop | JWT expired / wrong issuer / missing `userId` claim |
| 400 `fields` | Missing `q`/`searchterms`, `catalogId`, `category`, `subcategory` |
| Nothing enqueued | Registry `enabled[env]` all false, or `sources` filtered to empty |
| Cross-env leak | `A_SEARCH_ENV` vs body `sandbox` mismatch |

## Tests

From repo root (Node >=20):

```bash
npm test
```

FR-003 pins: `tests/entry-scaffold.test.js` (paths + skill mentions
`POST /search` and JWT `userId`).
