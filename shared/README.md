# `@a-search/shared`

Shared Node package for a-search deterministic helpers (results path,
writeResults, assertEnv, product normalize, intake reporter, tracked URLs).

## Lambda layer path

Publish / mount this package so Lambda code can require it from:

```text
/opt/nodejs/a-search
```

That matches the clubscan layer-first layout. CDK may alternatively
bundle `shared/` into each function; either way, **one** copy of shared
helpers — never fork under `providers/*/src`.

## Local require

From the monorepo (before layer publish):

```js
require('@a-search/shared'); // package name (FR-047a)
// or relative: require('../shared/links/buildTrackedUrl')
```

Wire `"@a-search/shared": "file:shared"` in the root `package.json` when
consumers switch (later FR-047 slices). Moving modules out of
`worker/lib/` is **out of scope for FR-047a**.

## Contents today

| Path | Notes |
|------|--------|
| `index.js` | Package entry + `layerPath` constant |
| `onboarding/drain.js` | FR-049b loop runOnce until remaining=0 |
| `onboarding/signupsPath.js` | FR-052b S3 key `{env}/_reports/{source}/{day}/signups.json` |
| `onboarding/writeSignups.js` | FR-052b `writeSignupEvents` / `readSignupEvents` (S3 JSON LOCKED) |
| `onboarding/readSignups.js` | FR-052c `listSignupEvents` for report job (env/source/day filter) |
| `assertEnv.js` | FR-047d / FR-007 `assertWorkerEnv` |
| `intake/reportException.js` | FR-048a fatal → intake POST |
| `intake/redact.js` | FR-048b `redactSecrets` for intake bodies |
| `links/buildTrackedUrl.js` | FR-057a tracked URL helper |
| `mapping/mapping.js` | FR-054b upsert/get + FR-054e `listMappingsByUserId` (injectable store) |
| `mapping/s3Store.js` | FR-054c durable S3 `{env}/_mapping/{userId}/{source}/{tokenHash}.json` (+ list prefix) |
| `writeResults.js` | Results PutObject; FR-054d upserts mapping after success |

See parent FR-047 and `docs/feature-request-phase1b-2026-10-07.md` (Q2).
