# AGENTS — a-search etsy (live)

Provider CWD for registry id `etsy` (`kind: live`).

## Read first

1. `.grok/skills/a-search-etsy/SKILL.md` (maintain)
2. `.grok/skills/a-search-etsy-onboarding/SKILL.md` (setup; stay-dark)
3. `docs/endpoint-search.md`, `docs/environments.md`

## CAST IRON

- Never commit provider secrets.
- Refuse jobs when `message.env` !== `A_SEARCH_ENV`.
- Results key: `{env}/etsy/{userId}/{catalogId}/{searchId}.json`.

## Shape

- `src/worker.js` — `run(msg)` stub
- `.env.example` — placeholders
