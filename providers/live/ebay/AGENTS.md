# AGENTS — a-search eBay live (`providers/live/ebay`)

You are in the **eBay live provider** CWD. This folder owns the SQS worker
that calls the eBay Browse API and writes results JSON to S3.

## Read first

1. `.grok/skills/a-search-ebay/SKILL.md`
2. Repo docs: `docs/endpoint-search.md`, `docs/environments.md`
3. Shared helpers under `../../../worker/lib/` when present

## CAST IRON

- Never commit eBay OAuth client secrets or tokens.
- Refuse jobs when `message.env` !== `A_SEARCH_ENV`.
- Results key: `{env}/ebay/{userId}/{catalogId}/{searchId}.json`.

## Shape

- `src/worker.js` — `run(msg)` stub (Browse API client lands in a later FR)
- `.env.example` — eBay credential placeholders + queue/S3 knobs
