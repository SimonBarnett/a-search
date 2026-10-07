# Add a source (checklist)

Goal: add a new affiliate / local provider **without editing `entry/` core**.
Entry already fans out via `providers/loadRegistry.js` → `enabled(env)`. A new
source is folder + registry + queue wiring. Flip `enabled` per env to turn it
on or off — no rewrite of JWT, accept, or fan-out code.

Vision gate **S3** (`docs/vision.md`): *New source = folder + registry + queue;
toggle via registry `enabled` (per env)*. A disabled source must never be
enqueued; adding a source must not require an `entry/` rewrite.

## Checklist

1. **Pick kind and id**
   - `live` → `providers/live/<id>/` (remote search API on each SQS job)
   - `local` → `providers/local/<id>/` (MSSQL Parts search; feeds owned by `maintainer/`)
   - `id` is lowercase, matches folder name and registry `id` (see shortlist)

2. **Scaffold the provider CWD** (see `docs/skillbook-layout.md`)
   - `AGENTS.md` — CAST IRON + “you are in `<id>` CWD”
   - `.grok/skills/a-search-<id>/SKILL.md` — auth/API or Parts path, SQS, S3, failures
   - `.env.example` — **this provider’s secrets only** (never put them in `entry/.env.example`)
   - `src/worker.js` — export `run(msg)`; refuse when `message.env` ≠ `A_SEARCH_ENV`
   - Optional `package.json` for provider-only deps

3. **Register the source** in `providers/registry.json`
   - Fields: `id`, `kind`, `folder`, `enabled: { live, sandbox }`, `queueEnv`
   - Default `enabled` false until credentials and worker are ready
   - Loader: `providers/loadRegistry.js` → `enabled(env)` — entry uses this only

4. **Queue names** (live and sandbox never share a queue)
   - Pattern from `providers/queueName.js`: `a-search-{id}-live` / `a-search-{id}-sandbox`
   - Wire queue URLs into deploy/IaC (CDK stack) and the worker’s env; entry needs
     the send URL only when that source is enabled for the request env

5. **Results path**
   - Key shape: `{env}/{sourceId}/{userId}/{catalogId}/{searchId}.json` (see worker helpers)
   - Write via shared results helpers; never invent a parallel layout

6. **Tests**
   - Provider scaffold / `run(msg)` tests under `tests/`
   - Confirm registry lists the id; disabled env is absent from `enabled(env)`
   - Confirm fan-out does not enqueue when `enabled[env]` is false

7. **Do not edit `entry/` core**
   - No changes under `entry/src` for a normal new source
   - No new provider secrets in `entry/.env.example`
   - No hard-coded source lists in the accept/fan-out path — registry `enabled` only
   - If entry must change (new accept field, JWT rule), that is a **separate FR**, not part of add-source

8. **Local sources only — maintainer**
   - Feed download / MERGE / scoped delete stays in `maintainer/`
   - Provider worker **reads** Parts; it does not ingest CSV

9. **Docs / shortlist**
   - Add or update the row in `docs/provider-shortlist.md` when the id is new
   - Link skillbook naming: `a-search-<id>`

## Done when

- [ ] Folder + skillbook + `.env.example` + `run(msg)` stub exist
- [ ] `providers/registry.json` has the source with per-env `enabled`
- [ ] Live and sandbox queue names follow `a-search-{id}-{env}`
- [ ] Tests cover scaffold + registry enabled behaviour
- [ ] **No** `entry/` core edits required for fan-out to see the source

## References

- `docs/vision.md` (S3 extensibility)
- `docs/provider-shortlist.md`
- `docs/skillbook-layout.md`
- `docs/environments.md`
- `providers/registry.json`, `providers/loadRegistry.js`, `providers/queueName.js`
