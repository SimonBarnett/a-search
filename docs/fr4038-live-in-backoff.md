# Live provider IN/ write (FR #4038)

Follow-up to FR #4030 / PR #4035 shared helpers.

Live provider workers (`providers/live/*/src/worker.js`) write:

`a-clubs/{hostkey}/{guid}/IN/{searchid}-{source}.json`

via `shared/search/writeLiveProviderInResult.js` (not `shared/writeResults.js` / results bucket).

On HTTP **429**, handlers call `shared/search/handleSqsWith429.js` (`backoffFor429` + `ChangeMessageVisibility`), then rethrow so SQS retries (never fail straight to DLQ). CDK wires live workers with `A_CLUBS_BUCKET` + read/write on `a-clubs`, plus `s3:CopyObject` / `GetObjectTagging` / `PutObjectTagging` and `GetObjectAnnotation` / `ListObjectAnnotations` for `touchLastmod` (`rewriteMarkerMetadata`; FR #4545 / #4559 --- `grantReadWrite` alone is not enough; annotated markers need annotation read).

**FR #4561 / #4438:** `*_missing_credentials` still ack/delete the SQS message (config skip, not an API failure). The handler ERROR-logs `provider` + `searchid` + code (no secrets) and writes a status IN with `products: []` and `error: "missing_credentials"` when `hostkey`/`guid`/`searchid` are present.

**FR #4769:** any other provider API failure (`nonRetryable` auth/eligibility/client faults, permanent vendor codes, 4xx/5xx that are not paced 429) must **not** write an IN file. `handleSqsWith429` ERROR-logs `provider_failure` (status, code, searchid, host, guid; no secrets) and rethrows so SQS retries into the provider DLQ. Do not intake-fatal those faults.

Affiliate link rules are unchanged. Writing IN/ bumps GUID + host `lastmod` (#3968). **FR #4559:** after the IN/ JSON is written, marker `lastmod` rewrite is **best-effort** --- AccessDenied/403 on CopyObject is logged and must not throw (successful searches must not land in the DLQ). `touchLastmod` still preserves existing metadata including `annotated=1` (FR #4251) and tags (`TaggingDirective: COPY`).
