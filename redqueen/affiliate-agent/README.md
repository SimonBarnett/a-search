# Affiliate agent (FR #4123 / #4701)

Provider-aware daily agent for **Awin** (invite/join + feed folders) and **Rakuten** (applications/approvals only — no SQL feeds).

## Entry points

```text
cd S:\a-affiliates\rakuten
C:\ai\a-search\tools\agent.ps1 -DryRun

node C:\ai\a-search\redqueen\affiliate-agent\src\run.js -Cwd S:\a-affiliates\rakuten -DryRun
```

`agent -?` / `tools\agent.ps1 -Help` lists `awin` and `rakuten`.

## Schedule

```powershell
.\redqueen\affiliate-agent\install\Register-AffiliateAgentTask.ps1 -Provider rakuten
# leaves a-search-awin-agent untouched
.\redqueen\affiliate-agent\install\Register-AffiliateAgentTask.ps1 -Provider awin
```

Daily 06:30, `IgnoreNew`. Credentials stay in `C:\passwords\{provider}.secret.txt` (never in the task XML).

## Seed docs

Copy `seed/a-affiliates/**` onto the live `S:\a-affiliates\` mount (or merge into existing AGENTS.md / rakuten/AGENT.md). Repo cannot hold live S3 secrets or publisher cookies.

## Rakuten scope

- Records: `rakuten/_applications/{mid|slug}/` metadata only
- No `feedurl` / `format` / `schedule` folders
- Merc's 10 pending applications imported once (`source=merc-manual`)
- Notify Simon once per Pending→Approved with `/search` MMFC rerun prompt
