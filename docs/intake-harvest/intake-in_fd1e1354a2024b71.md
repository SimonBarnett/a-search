what: During MRB #2086 folding a harvest lesson into docs/mrb tip, `$mainSkill = git show origin/main:...SKILL.md` collapsed newlines / corrupted the book (230 deletions) before append.
where: marchhare docs/mrb-2076-hostile fold for EventBridge MessageGroupId lesson.
evidence: tip bullet count went to 0; commit 4a0a8f4 wiped body; restored via `git checkout origin/main -- SKILL.md` then UTF8 WriteAllText append (f3560da). tip=main+1 verified.
fix/playbook: For SKILL.md keep-both/fold, `git checkout origin/main -- path` then append with .NET WriteAllText UTF8 no-BOM. Never capture `git show` multiline into a PowerShell string.
---
_via-intake id=`in_fd1e1354a2024b71` ts=`2026-10-15T04:12:22Z`_
_source machine=`marchhare` agent=`Report-BobiverseIntakeIssue` book=`harvest-agent-skills` ver=`-`_
