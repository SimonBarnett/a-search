# AGENTS — a-search tradedoubler (local)

Provider CWD for registry id `tradedoubler` (`kind: local`).

## Read first

1. `.grok/skills/a-search-tradedoubler/SKILL.md`
2. `docs/endpoint-search.md`, `docs/environments.md`

## CAST IRON

- Never commit provider secrets.
- Refuse jobs when `message.env` !== `A_SEARCH_ENV`.
- Results key: `{env}/tradedoubler/{userId}/{catalogId}/{searchId}.json`.

## Shape

- `src/worker.js` — `run(msg)` stub
- `.env.example` — placeholders
