# AGENTS — redqueen Awin onboarding agent (FR #4123 / #4126)

> **CAST IRON harvest:** file every issue/FR/gap via
> Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...
> or POST https://irc.ntsa.uk/bob/v1/intake with -Repo SimonBarnett/a-search.
> Never print Awin passwords, OTP codes, or feed API keys.

CWD for the daily Awin onboarding agent. Follow README.md and
.grok/skills/a-search-awin-agent-*/SKILL.md.

## Instruction load order (Simon 2026-10-18)

1. Load **s3://a-affiliates/AGENTS.md** (S:\a-affiliates\AGENTS.md) first —
   generic affiliate rules for every provider.
2. Then load **s3://a-affiliates/awin/AGENT.md** (S:\a-affiliates\awin\AGENT.md) —
   Awin-specific details only. Provider file wins on Awin-only conflicts.
3. Pass **both** to the model (Grok first, then Cursor) in that order.
4. If either file is missing or empty, exit non-zero with
   missing_agents_md / missing_provider_agent_md (plus the path) **before**
   sign-in or any S3 write. Never fall back silently.

Folder writes still follow win/AGENT.md. Join/invite messages are per invitee
with the Awin hard cap of **149 characters**.

Runtime fuel: **Grok first**, Cursor when Grok is exhausted. Prefer -DryRun
before the first live schedule on redqueen.

Skill playbooks (FR #4126): Merc operator bodies are pasted into
-search-awin-agent-* skills (no PENDING stubs).
