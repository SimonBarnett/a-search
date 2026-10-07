# docs/mrb-87 — hostile pins for FR-030 amazon PA-API client

- `run(msg)` asserts env + AMAZON_* creds before HTTP; missing → `amazon_missing_credentials`
- Injectable `httpRequest` + `fixtures/search-items-ok.json` → normalize → `writeResults` putObject
- Secrets stay in `providers/live/amazon` (not entry/.env.example)
- Tests: `tests/amazon-search.test.js` (fixture S3 put + missing creds)
