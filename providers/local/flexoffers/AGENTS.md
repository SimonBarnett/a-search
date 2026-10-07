# AGENTS — a-search flexoffers (local)

Provider CWD for registry id `flexoffers` (`kind: local`).

## Read first

1. `.grok/skills/a-search-flexoffers/SKILL.md`
2. `docs/endpoint-search.md`, `docs/environments.md`

## CAST IRON

- Never commit provider secrets.
- Refuse jobs when `message.env` !== `A_SEARCH_ENV`.
- Results key: `{env}/flexoffers/{userId}/{catalogId}/{searchId}.json`.

## Shape

- `src/worker.js` — `run(msg)` stub
- `.env.example` — placeholders
