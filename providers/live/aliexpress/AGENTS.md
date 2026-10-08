# AGENTS — a-search aliexpress (live)

Provider CWD for registry id `aliexpress` (`kind: live`).

## Read first

1. `.grok/skills/a-search-aliexpress/SKILL.md` (maintain)
2. `.grok/skills/a-search-aliexpress-onboarding/SKILL.md` (setup; stay-dark)
3. `docs/endpoint-search.md`, `docs/environments.md`

## CAST IRON

- Never commit provider secrets.
- Refuse jobs when `message.env` !== `A_SEARCH_ENV`.
- Results key: `{env}/aliexpress/{userId}/{catalogId}/{searchId}.json`.

## Shape

- `src/worker.js` — `run(msg)` stub
- `.env.example` — placeholders
