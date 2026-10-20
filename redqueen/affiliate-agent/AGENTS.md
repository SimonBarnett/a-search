# AGENTS — redqueen affiliate agent (FR #4123 / #4701)

> **CAST IRON harvest:** file gaps via Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search.
> Never print Awin/Rakuten passwords, OTP codes, or API tokens.

Provider-aware daily agent. CWD must be under `a-affiliates/{awin|rakuten}`.
Load order: root AGENTS.md → SKILLS.md → `{provider}/AGENT.md` → SKILLS.md.
Runtime fuel for interactive seats: Grok `agent.exe` first, then Cursor; scheduled
task runs `node .../affiliate-agent/src/run.js`.

Rakuten (FR #4701): applications/approvals only — never create SQL feed folders.
