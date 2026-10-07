# a-search IaC (FR-023)

AWS **CDK** skeleton for the entry Lambda and per-source SQS queues.

## What is included

- `ASearchStack` — Node 20 entry Lambda (`entry/src` → `index.handler`)
- Queue pair for Amazon:
  - `a-search-amazon-live`
  - `a-search-amazon-sandbox`

Queue names match `providers/queueName.js` (`a-search-{source}-{env}`).

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
