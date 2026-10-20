# Live provider IN/ write (FR #4038)

Follow-up to FR #4030 / PR #4035 shared helpers.

Live provider workers (`providers/live/*/src/worker.js`) write:

`a-clubs/{hostkey}/{guid}/IN/{searchid}-{source}.json`

via `shared/search/writeLiveProviderInResult.js` (not `shared/writeResults.js` / results bucket).

On HTTP **429**, handlers call `shared/search/handleSqsWith429.js` (`backoffFor429` + `ChangeMessageVisibility`), then rethrow so SQS retries (never fail straight to DLQ). CDK wires live workers with `A_CLUBS_BUCKET` + read/write on `a-clubs`, plus `s3:CopyObject` / `GetObjectTagging` / `PutObjectTagging` for `touchLastmod` (`rewriteMarkerMetadata`; FR #4545 — `grantReadWrite` alone is not enough).

**FR #4561 / #4438:** `*_missing_credentials` (and other `nonRetryable` provider skips) still ack/delete the SQS message (no retry, no intake fatal). The handler ERROR-logs `provider` + `searchid` + code (no secrets) and writes a status IN with `products: []` and `error: "missing_credentials"` (or the skip code) when `hostkey`/`guid`/`searchid` are present.

Affiliate link rules are unchanged. Writing IN/ bumps GUID + host `lastmod` (#3968).
