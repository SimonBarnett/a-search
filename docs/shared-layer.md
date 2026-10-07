# Shared layer (`shared/`)

Deterministic a-search helpers live in the **`shared/`** Node package
(`@a-search/shared`). Providers and workers must **require** that package (or
a relative path into `shared/`) — they must not copy-paste `resultsKey`,
`writeResults`, `assertWorkerEnv`, or product normalize under
`providers/*/src`.

See FR-047 and phase-1b Q2 (`docs/feature-request-phase1b-2026-10-07.md`).

## Lambda layer path

Publish or mount the package so Lambda runtimes can load it from:

```text
/opt/nodejs/a-search
```

That matches the clubscan layer-first layout. CDK may instead **bundle**
`shared/` into each `NodejsFunction` / asset; either approach is fine as long
as there is **one** copy of the helpers.

Package constant: `require('@a-search/shared').layerPath` →
`/opt/nodejs/a-search` (see `shared/index.js`).

## Repo layout

| Path | Role |
|------|------|
| `shared/package.json` | Package name `@a-search/shared` (FR-047a) |
| `shared/index.js` | Entry + `layerPath` |
| `shared/README.md` | Package-local notes |
| `shared/links/buildTrackedUrl.js` | FR-057a tracked URL helper |
| `shared/assertEnv.js` | FR-047d (when merged) — else still `worker/lib/assertEnv.js` |
| `shared/resultsPath.js` | FR-047b (when merged) — else still `worker/lib/resultsPath.js` |
| `shared/writeResults.js` | FR-047c (when merged) — else still `worker/lib/writeResults.js` |
| `shared/normalizeProduct.js` | Later FR-047 slice — today `worker/lib/normalizeProduct.js` |

Root `package.json` depends on `"@a-search/shared": "file:shared"`.

## Local require

```js
require('@a-search/shared');
// or, while migrating:
require('../shared/resultsPath');
require('../../../../shared/assertEnv');
```

## Anti-patterns (fail)

- A second `resultsPath.js` / `writeResults.js` under `providers/**/src`
- Forked `resultsKey` string templates in provider workers
- Publishing `@a-search/shared` to public npm (out of scope)

## CDK note

Worker and entry packaging should include `shared/` via Lambda layer
`/opt/nodejs/a-search` **or** asset/bundling that copies `shared/` into the
deployable. Automating layer publish is out of scope for FR-047e; see
`cdk/README.md`.
