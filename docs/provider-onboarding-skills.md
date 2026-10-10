# Provider onboarding skillbook contract (FR-060a)

Every provider agent folder must ship an **onboarding** skillbook so an agent
sitting in that CWD can lead a human through provider account setup without
reading sibling providers or inventing secret paths.

This doc is the **contract**. Per-provider skill bodies are separate FRs
(FR-060c..). Disabled stubs may ship a minimal stub (FR-060i).

## Required path pattern

For registry id `<id>` (folder `providers/live/<id>/` or `providers/local/<id>/`):

```
providers/<kind>/<id>/.grok/skills/a-search-<id>-onboarding/SKILL.md
```

Examples:

| Registry id | Onboarding skill path |
|-------------|------------------------|
| `amazon` | `providers/live/amazon/.grok/skills/a-search-amazon-onboarding/SKILL.md` |
| `awin` | `providers/local/awin/.grok/skills/a-search-awin-onboarding/SKILL.md` |
| `cj` | `providers/live/cj/.grok/skills/a-search-cj-onboarding/SKILL.md` |
| `kelkoo` | `providers/live/kelkoo/.grok/skills/a-search-kelkoo-onboarding/SKILL.md` (FR-062 stub; stay-dark) |
| `skimlinks` | `providers/live/skimlinks/.grok/skills/a-search-skimlinks-onboarding/SKILL.md` (FR-062 stub; stay-dark) |
| `aliexpress` | `providers/live/aliexpress/.grok/skills/a-search-aliexpress-onboarding/SKILL.md` (enabled FR-169; onboarding skill retained) |
| `etsy` | `providers/live/etsy/.grok/skills/a-search-etsy-onboarding/SKILL.md` (FR-062 stub; stay-dark) |
| `bol` | `providers/live/bol/.grok/skills/a-search-bol-onboarding/SKILL.md` (FR-062 stub; stay-dark) |

Naming: `a-search-<id>-onboarding` - always the `-onboarding` suffix. This is
**separate** from the maintain skillbook `a-search-<id>` (see
`docs/skillbook-layout.md`).

## Required content (every onboarding SKILL.md)

1. **CAST IRON harvest + intake**
   - Same honesty-box rule as other a-search skills: file gaps/bugs via intake
     to `SimonBarnett/a-search`; harvest playbooks back into **this** onboarding
     skillbook (or the maintain skill when the lesson is runtime, not setup).
   - Never put tokens, passwords, or partner keys in filings, skills, or logs.

2. **Obtain `.env` account credentials**
   - Steps to create or request the provider account / API keys for **this**
     source only.
   - Map each secret to the placeholder names in that folder's `.env.example`.
   - Secrets live only in `providers/<kind>/<id>/.env` (never `entry/.env`).

3. **Sandbox vs live**
   - How sandbox credentials / endpoints differ from live for this provider.
   - Which registry `enabled` flags and queue / `A_SEARCH_ENV` values to use
     while onboarding (prefer sandbox first).

4. **Selftest pointer**
   - Point at the product selftest path once it exists (FR-059 family:
     `docs/endpoint-selftest.md` / selftest route). Until that lands, say
     "selftest TBD - use sandbox worker smoke / provider fixture tests".
   - Onboarding skill does not implement selftest; it only tells the agent
     where to verify after credentials are in place.

## Agent start rule

- CWD = the provider folder (e.g. `providers/live/amazon`)
- Read `AGENTS.md`, then **both**:
  - `.grok/skills/a-search-<id>/SKILL.md` (maintain / runtime)
  - `.grok/skills/a-search-<id>-onboarding/SKILL.md` (setup)
- Do not require loading other providers' onboarding skills

## Checklist (add-source)

When adding a source (`docs/add-source.md`):

- [ ] Maintain skillbook `a-search-<id>` exists
- [ ] Onboarding skillbook `a-search-<id>-onboarding` exists (or stub if disabled)
- [ ] Onboarding SKILL covers harvest/intake, `.env` obtain steps, sandbox vs live, selftest pointer
- [ ] No secrets committed

## Live stubs (FR-062)

Disabled live registry ids **must** still ship a minimal onboarding stub
(CAST IRON harvest + deferred `.env` + sandbox/live + selftest pointer) even
while `enabled.live` and `enabled.sandbox` stay false:

`kelkoo`, `etsy`, `bol` (skimlinks FR-168 + aliexpress FR-169 enabled; skills remain)

`skimlinks` keeps its onboarding skill after FR-168 enable (credentials +
selftest still documented there). See `docs/phase2-providers.md` stay-dark rule
for remaining stubs.

## Out of scope (this contract doc)

- Writing each provider's onboarding body (FR-060c..h)
- Automated tests that every enabled provider has the folder (FR-060b)
- ~~Vision Success row (FR-060j)~~ - landed as Success **S20**
- Enabling live stubs or implementing their search clients (later Phase-2 FRs)

## References

- `docs/skillbook-layout.md`
- `docs/add-source.md`
- `docs/environments.md`
- `docs/provider-shortlist.md`
