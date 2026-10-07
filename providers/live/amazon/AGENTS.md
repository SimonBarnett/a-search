# AGENTS — a-search Amazon live (`providers/live/amazon`)

You are in the **Amazon live provider** CWD. This folder owns the SQS
worker that calls Amazon Product Advertising / search APIs and writes
results JSON to S3. It does **not** own JWT accept or MSSQL maintainer.

## Read first

1. `.grok/skills/a-search-amazon/SKILL.md`
2. Repo docs: `docs/endpoint-search.md`, `docs/environments.md`, `docs/vision.md`
3. Shared helpers: `../../../worker/lib/` (results path / write when present)

## CAST IRON

- Never commit Amazon access keys, secret keys, or partner tags.
- Respect `message.env` vs `A_SEARCH_ENV` — refuse cross-env jobs.
- Write results only at the canonical key
  `{env}/amazon/{userId}/{catalogId}/{searchId}.json`.

## Shape

- `src/worker.js` — `run(msg)` stub (FR-030 lands live HTTP client)
- `.env.example` — Amazon credential placeholders + queue/S3 knobs

Harvest Amazon playbooks into
`.grok/skills/a-search-amazon/SKILL.md`.
