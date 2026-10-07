# AGENTS — a-search impact (local)

Provider CWD for registry id `impact` (`kind: local`).

## Read first

1. `.grok/skills/a-search-impact/SKILL.md`
2. `docs/endpoint-search.md`, `docs/environments.md`

## CAST IRON

- Never commit provider secrets.
- Refuse jobs when `message.env` !== `A_SEARCH_ENV`.
- Results key: `{env}/impact/{userId}/{catalogId}/{searchId}.json`.

## Shape

- `src/worker.js` — `run(msg)` stub
- `.env.example` — placeholders
