

## Harvested lessons (intake)

- MRB FR-058d: shared/pacing/throttleBackoff.js classifies HTTP 407/429, sleeps Retry-After (or default), throws ProviderThrottleError once — no tight in-process HTTP retry; SQS retries later; pin both statuses + Retry-After
