# Awin invite scheduler (deterministic)

Zero-LLM daily joins from Join Programmes / notJoined.

Callable from the **provider cwd** (or bucket root for all `enabled=1` providers):

```powershell
cd S:\a-affiliates\awin
invite -Max 3              # dry-run
invite -Live -Max 20       # submit
invite -Live -Max 1 -Otp 123456

cd S:\a-affiliates
invite -Max 3              # every enabled=1 provider (awin; cj when enabled=1)
```

Shim: `C:\ai\a-search\tools\invite.ps1` (on PATH). Awin backend: `s3://a-affiliates/awin/_invite/invite.mjs` (agentRoot `awin-agent`). CJ backend: `redqueen/cj-invite/` (FR #5066; agentRoot `C:\ai\a-search\cj-invite`).

- Cwd gate: `a-affiliates` root or provider folder; provider must be `enabled=1`
- Enabled provider without a registered invite backend → `invite_not_implemented` (exit 4)
- Registered providers: `awin`, `cj` (keep CJ marker `enabled=0` until #5057)
- 90-day gate: `{provider}/_invites/{id}/` metadata `invitedat`
- Skip existing `{provider}/{id}/` folders
- Personalised <=149-char messages from scraped name/sector/feed/approval (Awin)
- Report: `C:\ai\a-search\logs\awin-invite\{yyyy-mm-dd}.json`
- Exit 2 = needs OTP (ask Simon; tick trust device); exit 5 = `cj_account_not_active`
- Long waits show a `/ | \ -` spinner on stderr (same style as `download` / `onboard`)
- Tests: `npm test` in `awin-agent`; CJ: `tests/fr5066-cj-invite.test.js`

## Task Scheduler (example)

Do not enable `-Live` on the schedule until a supervised smoke pass succeeds.

```powershell
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -File C:\ai\a-search\tools\invite.ps1 -Path S:\a-affiliates\awin -Live -Max 20'
$trigger = New-ScheduledTaskTrigger -Daily -At 9:15am
$settings = New-ScheduledTaskSettingsSet -SingleInstance -StartWhenAvailable
Register-ScheduledTask -TaskName 'a-search-awin-invite' -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest
```

Lock: `%ProgramData%\a-search\awin-invite.lock`. Second start exits 0 with `already_running`.
