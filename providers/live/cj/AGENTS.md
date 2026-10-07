# AGENTS — a-search cj (live)

Provider CWD for registry id `cj` (`kind: live`).

## Read first

1. `.grok/skills/a-search-cj/SKILL.md`
2. `docs/endpoint-search.md`, `docs/environments.md`

## CAST IRON

- Never commit provider secrets.
- Refuse jobs when `message.env` !== `A_SEARCH_ENV`.
- Results key: `{env}/cj/{userId}/{catalogId}/{searchId}.json`.

## Shape

- `src/worker.js` — `run(msg)` stub
- `.env.example` — placeholders
