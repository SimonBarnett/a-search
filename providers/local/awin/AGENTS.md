# AGENTS — a-search Awin local (`providers/local/awin`)

You are in the **Awin local provider** CWD. This folder owns the SQS
worker that **SELECTs MSSQL Parts** for Awin-sourced rows and writes
results JSON to S3. Feed **ingest** is the maintainer (`../../../maintainer/`);
this folder owns feed-parser/creds hooks and the search read path.

## Read first

1. `.grok/skills/a-search-awin/SKILL.md`
2. Repo docs: `docs/parts-maintainer.md`, `docs/endpoint-search.md`,
   `docs/environments.md`, `docs/vision.md`
3. Shared helpers: `../../../worker/lib/` (results path / write when present)
4. Parts DDL: `../../../maintainer/sql/002_Parts.sql`

## CAST IRON

- Never commit MSSQL passwords, Awin publisher tokens, or feed URLs with
  embedded credentials.
- Respect `message.env` vs `A_SEARCH_ENV` — refuse cross-env jobs.
- Write results only at the canonical key
  `{env}/awin/{userId}/{catalogId}/{searchId}.json`.
- Do **not** download CSV feeds from this worker; that is maintainer work.

## Shape

- `src/worker.js` — `run(msg, deps?)` with injectable `queryParts` mock
- `.env.example` — MSSQL + queue/S3 knobs (Awin feed secrets for parser FRs)

Harvest Awin playbooks into
`.grok/skills/a-search-awin/SKILL.md`.
