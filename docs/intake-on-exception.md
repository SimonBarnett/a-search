# Intake on deterministic exceptions (FR-048)

Fatal / unhandled exceptions in **deterministic** a-search code must file an
issue through the bobiverse intake webhook with
**`repo=SimonBarnett/a-search`**. Do not rely on `console.log` alone.

Helper (on main): `shared/intake/reportException.js` -
`POST https://irc.ntsa.uk/bob/v1/intake` with `kind: issue`, redacted body, and
`idempotency_key` = sha256(`code|message|route`).

## Surfaces that must wire a top-level catch

| Surface | Route / source cue | Notes |
|---------|-------------------|--------|
| **Entry** | `entry/POST /search` | Unexpected throws -> intake + HTTP 500. Auth/validation 401/400 do **not** file. |
| **Workers** | `providers/live/amazon/handler` (FR-048d); other live/local SQS handlers | Amazon landed: unexpected fatals -> intake then **rethrow**. Other workers follow-on FR-048 slices. `EnvIsolationError` skips intake. |
| **Maintainer** | `maintainer/schedule` | EventBridge schedule fatals -> intake then rethrow. |
| **Onboarding** | provider onboarding runners | Scheduled/local onboarding agent fatals -> intake (wire in follow-on FR-048 slices). |

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

## Lambda egress to intake (FR-158)

Installable stack is **explicit no-VPC** (FR-149): Lambdas use default AWS
egress. Intake is a public HTTPS POST to `irc.ntsa.uk` - the same networking
class as any outbound HTTPS call (no VPC/NAT/SG constructs in product CDK).

### Measure (ops / deploy seat)

From a one-shot Lambda or bastion in the **same account/region** as the stack:

1. `POST https://irc.ntsa.uk/bob/v1/intake` with a tiny probe body
   (`kind=issue`, `repo=SimonBarnett/a-search`, title prefixed `do-not-file:` /
   `probe:`) and confirm **HTTP 202** (or documented intake success).
2. Or from Windows: `Invoke-WebRequest -Method POST -Uri https://irc.ntsa.uk/bob/v1/intake ...`
3. Record pass/fail in the **ops** runbook only. Never commit real egress CIDRs
   or private IPs into this repo (same rule as FR-149 MSSQL allowlist).

If measure fails, treat intake as **egress-blocked** for that account/region
until network/DNS/TLS is fixed. Do not invent a private intake proxy in this FR.

### Env override

`shared/intake/reportException.js` resolves the intake URL as:

1. `opts.intakeUrl` (tests / injectors)
2. `A_SEARCH_INTAKE_URL` (preferred product override)
3. `BOB_INTAKE_URL` (fleet alias)
4. default `https://irc.ntsa.uk/bob/v1/intake`

Set `A_SEARCH_INTAKE_URL` on Lambda environment only when ops redirects to a
documented alternate intake endpoint. Empty/unset keeps the default.

### Fail-soft when egress is blocked

When `fetch` throws (DNS / timeout / TLS / network), `reportException`:

- returns `{ ok: false, egressBlocked: true, code: 'intake_egress_blocked', ... }`
- logs a structured `console.error` JSON line with `code=intake_egress_blocked`
  (CloudWatch Logs) - **not** a silent swallow
- does **not** throw, so entry/worker catch blocks can still return HTTP 500 /
  rethrow the **original** fatal

Private intake proxy is **out of scope**. Prefer fixing egress; optional local
report-outbox paths stay fleet-side (bobiverse harvest Flush), not Lambda.

## Related

- FR-048 and slices FR-048a+ (helper, redact, entry/amazon/maintainer wires)
- FR-149 explicit no-VPC + MSSQL fixed-egress allowlist (`docs/deploy.md`)
- FR-158 pin: `tests/fr158-intake-egress-docs.test.js`
- CAST IRON harvest in each agent CWD (`docs/skillbook-layout.md`)
- Shared package layout: `docs/shared-layer.md`
