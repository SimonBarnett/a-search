# AGENTS — a-search bol (live)

Provider CWD for registry id `bol` (`kind: live`).

## Read first

1. `.grok/skills/a-search-bol/SKILL.md` (maintain)
2. `.grok/skills/a-search-bol-onboarding/SKILL.md` (setup; stay-dark)
3. `docs/endpoint-search.md`, `docs/environments.md`

## CAST IRON

- Never commit provider secrets.
- Refuse jobs when `message.env` !== `A_SEARCH_ENV`.
- Results key: `{env}/bol/{userId}/{catalogId}/{searchId}.json`.

## Shape

- `src/worker.js` — `run(msg)` stub
- `.env.example` — placeholders
