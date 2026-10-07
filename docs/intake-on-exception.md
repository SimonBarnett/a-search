# Intake on deterministic exceptions (FR-048)

Fatal / unhandled exceptions in **deterministic** a-search code must file an
issue through the bobiverse intake webhook with
**`repo=SimonBarnett/a-search`**. Do not rely on `console.log` alone.

Helper (when merged): `shared/intake/reportException.js` →
`POST https://irc.ntsa.uk/bob/v1/intake` with `kind: issue`, redacted body, and
`idempotency_key` = sha256(`code|message|route`).

## Surfaces that must wire a top-level catch

| Surface | Route / source cue | Notes |
|---------|-------------------|--------|
| **Entry** | `entry/POST /search` | Unexpected throws → intake + HTTP 500. Auth/validation 401/400 do **not** file. |
| **Workers** | `providers/live/*/handler` (and local SQS handlers) | Unexpected fatals → intake then **rethrow** for SQS retry. `EnvIsolationError` skips intake. |
| **Maintainer** | `maintainer/schedule` | EventBridge schedule fatals → intake then rethrow. |
| **Onboarding** | provider onboarding runners | Scheduled/local onboarding agent fatals → intake (wire in follow-on FR-048 slices). |

## Do file

- Uncaught errors in entry / SQS worker / maintainer / onboarding runners
- Unexpected infrastructure failures (SQS/S3/MSSQL/HTTP client blow-ups)
- Programmer errors that escape the happy path

## Do not file

- Client validation failures (HTTP 400 missing fields, invalid JSON body)
- Auth failures (HTTP 401 `AuthError`)
- Expected env isolation refuses (`EnvIsolationError` / message.env mismatch)
- Routine 304 / skip paths in the maintainer

## Secrets

Never put JWTs, `Authorization` headers, passwords, connection strings, or
API keys in the intake title/body. Use `shared/intake/redact.js`
(`redactSecrets`) before POST.

## Offline / VPC

If Lambda cannot reach `irc.ntsa.uk`, document the deploy constraint
(UNKNOWN until measured). Prefer queueing to a local report-outbox when a
path exists; optional no-op + metric is acceptable only when egress is
blocked and documented.

## Related

- FR-048 and slices FR-048a… (helper, redact, entry/amazon/maintainer wires)
- CAST IRON harvest in each agent CWD (`docs/skillbook-layout.md`)
- Shared package layout: `docs/shared-layer.md` (when present)
