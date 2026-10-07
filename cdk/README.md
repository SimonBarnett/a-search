# a-search IaC (FR-023)

AWS **CDK** skeleton for the entry Lambda and per-source SQS queues.

## What is included

- `ASearchStack` — Node 20 entry Lambda (`entry/src` → `index.handler`)
- FR-036: live + sandbox SQS queues and SQS-triggered worker Lambdas for every
  registry source with `enabled.live` or `enabled.sandbox` (amazon, ebay,
  rakuten, cj, awin, impact). Names: `a-search-{id}-{env}`; workers
  `a-search-{id}-worker-{env}` with `handler=worker.handler`.
- Entry env receives `SQS_<SOURCE>_LIVE_URL` / `SQS_<SOURCE>_SANDBOX_URL` for
  each enabled source (FR-034 resolveQueueUrl) and SendMessage grants.
- Maintainer EventBridge schedules (FR-024), every 15 minutes:
  - `a-search-maintainer-live` → Lambda with `A_SEARCH_ENV=live`
  - `a-search-maintainer-sandbox` → Lambda with `A_SEARCH_ENV=sandbox`

Queue names match `providers/queueName.js` (`a-search-{source}-{env}`).
Disabled shortlist providers are not synthesised until enabled.

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
