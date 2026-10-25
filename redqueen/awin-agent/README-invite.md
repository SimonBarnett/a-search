# Awin invite scheduler (deterministic)

Zero-LLM daily joins from Join Programmes / notJoined.

Callable from the **provider cwd** (or bucket root for all `enabled=1` providers):

```powershell
cd S:\a-affiliates\awin
invite -Max 3              # dry-run
invite -Live -Max 20       # submit
invite -Live -Max 1 -Otp 123456

cd S:\a-affiliates
invite -Max 3              # every enabled=1 provider (today: awin only)
```

Shim: `C:\ai\a-search\tools\invite.ps1` (on PATH). Backend: `node C:\ai\a-search\awin-agent\scripts\invite.mjs`.

- Cwd gate: `a-affiliates` root or provider folder; provider must be `enabled=1`
- Enabled provider without a registered invite backend → `invite_not_implemented` (exit 4)
- 90-day gate: `awin/_invites/{id}/` metadata `invitedat`
- Skip existing `awin/{id}/` folders
- Personalised <=149-char messages from scraped name/sector/feed/approval
- Report: `C:\ai\a-search\logs\awin-invite\{yyyy-mm-dd}.json`
- Exit 2 = needs OTP (ask Simon; tick trust device)
- Long waits show a `/ | \ -` spinner on stderr (same style as `download` / `onboard`)
- Tests: `npm test` in `awin-agent`

## Task Scheduler (example)

Do not enable `-Live` on the schedule until a supervised smoke pass succeeds.

```powershell
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -File C:\ai\a-search\tools\invite.ps1 -Path S:\a-affiliates\awin -Live -Max 20'
$trigger = New-ScheduledTaskTrigger -Daily -At 9:15am
$settings = New-ScheduledTaskSettingsSet -SingleInstance -StartWhenAvailable
Register-ScheduledTask -TaskName 'a-search-awin-invite' -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest
```

Lock: `%ProgramData%\a-search\awin-invite.lock`. Second start exits 0 with `already_running`.
