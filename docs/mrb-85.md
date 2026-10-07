# docs/mrb-85 — hostile pins for FR-029 rclone results mount

- Canonical key `{env}/{source}/{userId}/{catalogId}/{searchId}.json` (matches resultsPath.js)
- Env vars `S3_RESULTS_BUCKET`, `A_SEARCH_RCLONE_ROOT`; links from environments.md + a-search-endpoint
- environments.md logical key must include `{env}/` prefix
- Tests: `tests/rclone-results-docs.test.js`
