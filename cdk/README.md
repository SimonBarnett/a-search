# a-search IaC (FR-023)

AWS **CDK** skeleton for the entry Lambda and per-source SQS queues.

## What is included

- FR-149: explicit **no-VPC** (default Lambda egress; no ec2.Vpc/NAT/SG). MSSQL path = ops fixed-egress allowlist (FR-122 option A) in `docs/deploy.md`

- `ASearchStack` - Node 20 entry Lambda (`entry/src` -> `index.handler`)
- FR-148: entry omits process `A_SEARCH_ENV` (accept stamps env from body.sandbox; workers stay pinned)
- HTTP API Gateway (FR-035): `POST /search` -> entry Lambda; output `SearchApiUrl`
- FR-036: live + sandbox SQS queues and SQS-triggered worker Lambdas for every
  registry source with `enabled.live` or `enabled.sandbox` (amazon, ebay,
  rakuten, cj, awin, impact). Names: `a-search-{id}-{env}`; workers
  `a-search-{id}-worker-{env}` with `handler=worker.handler`.
- Entry env receives `SQS_<SOURCE>_LIVE_URL` / `SQS_<SOURCE>_SANDBOX_URL` for
  each enabled source (FR-034 resolveQueueUrl) and SendMessage grants.
- Maintainer EventBridge schedules (FR-024), every 15 minutes:
  - `a-search-maintainer-live` Ã¢â€ â€™ Lambda with `A_SEARCH_ENV=live`
  - `a-search-maintainer-sandbox` Ã¢â€ â€™ Lambda with `A_SEARCH_ENV=sandbox`
- FR-056a: Awin onboarding live Lambda `a-search-awin-onboarding-live`
  (`A_SEARCH_ENV=live`, handler `handler.handler` from
  `providers/local/awin/onboarding/src`).
- FR-056b: Awin onboarding sandbox Lambda `a-search-awin-onboarding-sandbox`
  (`A_SEARCH_ENV=sandbox`).
- FR-056d: Impact onboarding sandbox Lambda `a-search-impact-onboarding-sandbox`
  (`A_SEARCH_ENV=sandbox`).
- FR-056e: EventBridge onboarding schedules (daily / `Schedule.rate(Duration.days(1))`,
  clubscan `Awin-Onboarding` intent):
  - rule `a-search-awin-onboarding-live` -> Lambda `a-search-awin-onboarding-live`
  - rule `a-search-awin-onboarding-sandbox` -> Lambda `a-search-awin-onboarding-sandbox`
  - rule `a-search-impact-onboarding-sandbox` -> Lambda `a-search-impact-onboarding-sandbox`
  - rule `a-search-impact-onboarding-live` -> Lambda `a-search-impact-onboarding-live` (FR-133)
  Outputs: `AwinOnboardingLiveRuleName`, `AwinOnboardingSandboxRuleName`,
  `ImpactOnboardingSandboxRuleName`, `ImpactOnboardingLiveRuleName`.

- FR-056c: Impact onboarding live Lambda `a-search-impact-onboarding-live`
  (`A_SEARCH_ENV=live`, handler `handler.handler` from
  `providers/local/impact/onboarding/src`). EventBridge live rule is FR-133 (extends FR-056e).
Queue names match `providers/queueName.js` (`a-search-{source}-{env}`).
Disabled shortlist providers are not synthesised until enabled.

- FR-142: each enabled worker queue has a sibling DLQ `{queueName}-dlq` with
  `deadLetterQueue.maxReceiveCount=3` (14-day retention). Outputs
  `{Pascal}{Live|Sandbox}DeadLetterQueueUrl`.
- FR-164: worker queue `visibilityTimeout` is 6x worker Lambda timeout (60s
  timeout -> 360s visibility) so SQS does not redeliver while the function runs.
- FR-143: explicit `logs.LogGroup` retention ONE_MONTH (30d) on every Lambda;
  placeholder SNS `a-search-ops-alarms`; per-DLQ depth alarm
  (`ApproximateNumberOfMessagesVisible >= 1`) with SnsAction. Output `OpsAlarmTopicArn`.

### Queue URL env convention (FR-034)

Entry Lambda environment uses **env-specific** keys that
`providers/resolveQueueUrl.js` prefers:

- `SQS_AMAZON_LIVE_URL` / `SQS_AMAZON_SANDBOX_URL` (already on the stack)
- Pattern for more sources: `SQS_<SOURCE>_LIVE_URL` + `SQS_<SOURCE>_SANDBOX_URL`
  from registry `queueEnv` `SQS_<SOURCE>_URL`

Do not document only the logical `SQS_<SOURCE>_URL` name while CDK emits only
the `*_LIVE_URL` / `*_SANDBOX_URL` pair without the resolver.

## Shared helpers (FR-047)

Shared code lives in repo `shared/` (`@a-search/shared`). Prefer a Lambda
layer at `/opt/nodejs/a-search` or bundle `shared/` into each function
asset â€” never duplicate helpers under `providers/*/src`. Layout:
[`docs/shared-layer.md`](../docs/shared-layer.md). Layer publish automation
is out of scope for FR-047e.

## Entry Lambda packaging (FR-037)

`Code.fromAsset(entry/src)` cannot resolve `../../providers/...` inside Lambda.
Run `npm run stage-entry` (also hooked from `npm run synth`) to write gitignored
`cdk/entry-lambda-asset/` containing `entry/src/**` plus `providers/registry.json`,
`loadRegistry.js`, `queueName.js`, and `resolveQueueUrl.js`. Handler:
`entry/src/index.handler`. No secrets in the asset.

## MSSQL Secrets Manager (FR-137)

Maintainer, `providers/local/*` workers, and awin/impact onboarding Lambdas
receive `MSSQL_*` from Secrets Manager:

```bash
npx cdk deploy --app "node cdk/bin/a-search.js" ASearchStack \
  -c mssqlSecretArn=arn:aws:secretsmanager:eu-west-2:ACCOUNT:secret:NAME \
  -c mssqlSandboxDatabase=YOUR_SANDBOX_DB
```

Secret string must be JSON with `SERVER`, `USER`, `PASSWORD`.
`MSSQL_DATABASE` is set in CDK (live default `madeiradb`; sandbox from
`mssqlSandboxDatabase` / default `<sandbox-mssql-database>`).
Without `mssqlSecretArn`, synth uses a non-production placeholder ARN
(`000000000000`) so pins stay green. Never put real passwords in git.
See `docs/environments.md` (FR-137).

## Provider credentials Secrets Manager (FR-138)

Each **enabled** provider worker (amazon, ebay, rakuten, cj, awin, impact)
reads credential keys from a **per-source** Secrets Manager JSON secret.
Awin/impact onboarding share the same source secret. Stay-dark providers
get no secret construct and no IAM grant.

```bash
npx cdk deploy --app "node cdk/bin/a-search.js" ASearchStack \
  -c amazonProviderSecretArn=arn:aws:secretsmanager:eu-west-2:ACCOUNT:secret:NAME \
  -c ebayProviderSecretArn=arn:aws:secretsmanager:eu-west-2:ACCOUNT:secret:NAME \
  -c rakutenProviderSecretArn=arn:... \
  -c cjProviderSecretArn=arn:... \
  -c awinProviderSecretArn=arn:... \
  -c impactProviderSecretArn=arn:...
```

JSON keys match that provider's `.env.example` credential names
(e.g. `AMAZON_ACCESS_KEY`, `EBAY_CLIENT_SECRET`, `AWIN_API_TOKEN`).
Without overrides, synth uses `000000000000` placeholder ARNs
(`a-search/provider/<id>-AbCdEf`). Matrix: `docs/secrets-matrix.md`.

## Synth (required check)

From the **repo root** (Node >=20):

```bash
npm install
npm run synth
```

`npm run synth` must exit **0**. Equivalent:

```bash
npx cdk synth --app "node cdk/bin/a-search.js"
```

## Deploy (FR-141)

Prefer the package script (stages the entry asset, then deploys with
`requireDeployEnv=true` so a missing account fails clearly):

```bash
npm run deploy -- -c account=ACCOUNT_ID -c region=eu-west-2
# aliases also accepted: -c deployAccount=... -c deployRegion=...
# or export CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION before npm run deploy
```

Equivalent:

```bash
npx cdk deploy --app "node cdk/bin/a-search.js" ASearchStack \
  -c requireDeployEnv=true -c account=ACCOUNT_ID -c region=eu-west-2
```

**Do not** put real AWS account IDs in `cdk/cdk.json`, source, or git.
`cdk/lib/resolve-deploy-env.js` reads context / env only. Synth may omit
`account` (env-agnostic); deploy must pass account via `-c` or
`CDK_DEFAULT_ACCOUNT`.

Requires AWS credentials. Not required for FR-023.

## SAM alternative

A future FR may add `template.yaml` for `sam validate`. Prefer CDK synth here
until SAM CLI is standard on fleet seats.

## Node version for synth / tests (FR-365)

CDK synth and npm-test synth children need **Node 20+** (`node:` builtins).
On marchhare the default PATH may resolve Node 8 first (`Cannot find module 'node:fs'`).

- Prefer `D:\Tools\node\node.exe` (or `D:\tools\node`) on PATH, or set `A_SEARCH_NODE_BIN`.
- Test helper `tests/helpers/runCdkSynth.js` prepends that Node directory to PATH for every `npm run synth` spawn.

## Entry JWT secrets (FR-136)

Entry Lambda JWT_* env vars come from Secrets Manager JSON (context -c jwtSecretArn=... or stack-created EntryJwtSecret). See [docs/deploy.md](../docs/deploy.md). Never put real JWT values in git.

