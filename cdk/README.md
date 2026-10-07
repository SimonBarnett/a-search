# a-search IaC (FR-023)

AWS **CDK** skeleton for the entry Lambda and per-source SQS queues.

## What is included

- `ASearchStack` — Node 20 entry Lambda (`entry/src` → `index.handler`)
- Queue pair for Amazon:
  - `a-search-amazon-live`
  - `a-search-amazon-sandbox`
- Maintainer EventBridge schedules (FR-024), every 15 minutes:
  - `a-search-maintainer-live` → Lambda with `A_SEARCH_ENV=live`
  - `a-search-maintainer-sandbox` → Lambda with `A_SEARCH_ENV=sandbox`

Queue names match `providers/queueName.js` (`a-search-{source}-{env}`).

### Queue URL env convention (FR-034)

Entry Lambda environment uses **env-specific** keys that
`providers/resolveQueueUrl.js` prefers:

- `SQS_AMAZON_LIVE_URL` / `SQS_AMAZON_SANDBOX_URL` (already on the stack)
- Pattern for more sources: `SQS_<SOURCE>_LIVE_URL` + `SQS_<SOURCE>_SANDBOX_URL`
  from registry `queueEnv` `SQS_<SOURCE>_URL`

Do not document only the logical `SQS_<SOURCE>_URL` name while CDK emits only
the `*_LIVE_URL` / `*_SANDBOX_URL` pair without the resolver.

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
