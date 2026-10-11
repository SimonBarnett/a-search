# AGENTS — a-search kelkoo (live)

Provider CWD for registry id `kelkoo` (`kind: live`).

## Read first

1. `.grok/skills/a-search-kelkoo/SKILL.md` (maintain)
2. `.grok/skills/a-search-kelkoo-onboarding/SKILL.md` (setup; FR-167 enabled)
3. `docs/endpoint-search.md`, `docs/environments.md`

## CAST IRON

- Never commit provider secrets.
- Refuse jobs when `message.env` !== `A_SEARCH_ENV`.
- Results key: `{env}/kelkoo/{userId}/{catalogId}/{searchId}.json`.

## Shape

- `src/worker.js` — `run(msg)` stub
- `.env.example` — placeholders
