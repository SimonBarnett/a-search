# AGENTS — a-search Rakuten live (`providers/live/rakuten`)

You are in the **Rakuten live provider** CWD. This folder owns the SQS
worker for Rakuten Product Search (often **XML** responses) and S3
results write.

## Read first

1. `.grok/skills/a-search-rakuten/SKILL.md` — XML + rate limits
2. Repo docs: `docs/endpoint-search.md`, `docs/environments.md`

## CAST IRON

- Never commit Rakuten application keys or affiliate tokens.
- Refuse jobs when `message.env` !== `A_SEARCH_ENV`.
- Results key: `{env}/rakuten/{userId}/{catalogId}/{searchId}.json`.

## Shape

- `src/worker.js` — `run(msg)` stub
- `.env.example` — Rakuten credential placeholders + queue/S3 knobs
