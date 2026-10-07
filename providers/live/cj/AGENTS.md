# AGENTS — a-search CJ live (`providers/live/cj`)

You are in the **CJ Affiliate live provider** CWD. This folder owns the
SQS worker for CJ GraphQL product search (`ads.api.cj.com`) and S3
results write.

## Read first

1. `.grok/skills/a-search-cj/SKILL.md`
2. Repo docs: `docs/endpoint-search.md`, `docs/environments.md`

## CAST IRON

- Never commit CJ personal access tokens or GraphQL secrets.
- Refuse jobs when `message.env` !== `A_SEARCH_ENV`.
- Results key: `{env}/cj/{userId}/{catalogId}/{searchId}.json`.

## Shape

- `src/worker.js` — `run(msg)` stub
- `.env.example` — CJ token placeholders + queue/S3 knobs
