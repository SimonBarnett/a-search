# AGENTS — redqueen Awin onboarding agent (FR #4123)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with `-Repo SimonBarnett/a-search`.
> Never print Awin passwords, OTP codes, or feed API keys.

CWD for the daily Awin onboarding agent. Follow `README.md` and
`.grok/skills/a-search-awin-agent-*/SKILL.md`. Follow
`s3://a-affiliates/awin/AGENT.md` for folder writes.

Runtime fuel: **Grok first**, Cursor when Grok is exhausted. Prefer `-DryRun`
before the first live schedule on redqueen.
