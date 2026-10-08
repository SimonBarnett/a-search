# a-search IaC (FR-023)

AWS **CDK** skeleton for the entry Lambda and per-source SQS queues.

## What is included

- `ASearchStack` â€” Node 20 entry Lambda (`entry/src` â†’ `index.handler`)
- HTTP API Gateway (FR-035): `POST /search` â†’ entry Lambda; output `SearchApiUrl`
- FR-036: live + sandbox SQS queues and SQS-triggered worker Lambdas for every
  registry source with `enabled.live` or `enabled.sandbox` (amazon, ebay,
  rakuten, cj, awin, impact). Names: `a-search-{id}-{env}`; workers
  `a-search-{id}-worker-{env}` with `handler=worker.handler`.
- Entry env receives `SQS_<SOURCE>_LIVE_URL` / `SQS_<SOURCE>_SANDBOX_URL` for
  each enabled source (FR-034 resolveQueueUrl) and SendMessage grants.
- Maintainer EventBridge schedules (FR-024), every 15 minutes:
  - `a-search-maintainer-live` â†’ Lambda with `A_SEARCH_ENV=live`
  - `a-search-maintainer-sandbox` â†’ Lambda with `A_SEARCH_ENV=sandbox`
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
  Outputs: `AwinOnboardingLiveRuleName`, `AwinOnboardingSandboxRuleName`,
  `ImpactOnboardingSandboxRuleName`. Impact live rule follows when that Lambda lands.

Queue names match `providers/queueName.js` (`a-search-{source}-{env}`).
Disabled shortlist providers are not synthesised until enabled.

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
asset — never duplicate helpers under `providers/*/src`. Layout:
[`docs/shared-layer.md`](../docs/shared-layer.md). Layer publish automation
is out of scope for FR-047e.

## Entry Lambda packaging (FR-037)

`Code.fromAsset(entry/src)` cannot resolve `../../providers/...` inside Lambda.
Run `npm run stage-entry` (also hooked from `npm run synth`) to write gitignored
`cdk/entry-lambda-asset/` containing `entry/src/**` plus `providers/registry.json`,
`loadRegistry.js`, `queueName.js`, and `resolveQueueUrl.js`. Handler:
`entry/src/index.handler`. No secrets in the asset.

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

## Deploy (later)

```bash
npx cdk deploy --app "node cdk/bin/a-search.js" ASearchStack
```

Requires AWS credentials. Not required for FR-023.

## SAM alternative

A future FR may add `template.yaml` for `sam validate`. Prefer CDK synth here
until SAM CLI is standard on fleet seats.

## Node version for synth / tests (FR-365)

CDK synth and npm-test synth children need **Node 20+** (`node:` builtins).
On marchhare the default PATH may resolve Node 8 first (`Cannot find module 'node:fs'`).

- Prefer `D:\Tools\node\node.exe` (or `D:\tools\node`) on PATH, or set `A_SEARCH_NODE_BIN`.
- Test helper `tests/helpers/runCdkSynth.js` prepends that Node directory to PATH for every `npm run synth` spawn.
