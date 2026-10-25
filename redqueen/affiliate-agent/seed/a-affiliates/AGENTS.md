# AGENTS --- a-affiliates (seed for FR #4701)

Generic affiliate rules for every provider. Provider `{provider}/AGENT.md` wins on conflicts.

## Load order

1. This file (`a-affiliates/AGENTS.md`)
2. `a-affiliates/SKILLS.md` (optional)
3. `a-affiliates/{provider}/AGENT.md`
4. `a-affiliates/{provider}/SKILLS.md` (optional)

## Skills harvest (section 13)

Merge new playbooks into provider `SKILLS.md` (provider-only) or root `SKILLS.md` (general). Never overwrite existing bullets.

## No-results sector feedback (FR #5047)

Read `a-clubs/_ops/need-vendors-by-sector.json` on the daily pass. Each sector
row means club searches returned 0 relevant parts (`need more vendors in sector
X`). Prefer joining or enabling advertisers that cover those sectors; merge
example queries into targeting notes. Internal only --- never auto-contact
networks from this ledger. Per-page detail: `a-clubs/{host}/{guid}/feedback/no-results.json`.
