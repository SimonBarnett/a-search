#!/usr/bin/env python3
"""Keep-both resolve for harvest SKILL.md, then verify+write (FR #3708).

Single step for MRB seats folding origin/main into a harvest tip that CONFLICTS
on `.grok/skills/harvest-agent-skills/SKILL.md`:

1. Replace each conflict hunk with both sides (markers stripped).
2. Refuse to write if any conflict marker remains.
3. Atomic write only when clean.

Exit 0 when the path is clean (and was written when markers were present).
Exit 1 on unresolved markers or I/O errors. Never leave a half-written file.
"""
from __future__ import annotations

import argparse
import os
import sys
import tempfile
from pathlib import Path

MARKER_OPEN = "<<<<<<<"
MARKER_SEP = "======="
MARKER_CLOSE = ">>>>>>>"


def line_is_marker(line: str) -> bool:
    s = line.lstrip("\ufeff").rstrip("\r\n")
    if s == MARKER_OPEN or s.startswith(MARKER_OPEN + " ") or s.startswith(MARKER_OPEN + "\t"):
        return True
    if s == MARKER_CLOSE or s.startswith(MARKER_CLOSE + " ") or s.startswith(MARKER_CLOSE + "\t"):
        return True
    if s == MARKER_SEP:
        return True
    return False


def has_conflict_markers(text: str) -> bool:
    for line in text.splitlines(keepends=True):
        if line_is_marker(line):
            return True
    return False


def keep_both_resolve(text: str) -> str:
    """Drop conflict markers; keep both sides of each hunk in order."""
    out: list[str] = []
    lines = text.splitlines(keepends=True)
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        s = line.lstrip("\ufeff").rstrip("\r\n")
        if s == MARKER_OPEN or s.startswith(MARKER_OPEN + " ") or s.startswith(MARKER_OPEN + "\t"):
            i += 1
            # ours
            while i < n:
                cur = lines[i]
                cs = cur.rstrip("\r\n")
                if cs == MARKER_SEP:
                    i += 1
                    break
                if line_is_marker(cur):
                    # malformed; keep scanning
                    i += 1
                    continue
                out.append(cur)
                i += 1
            # theirs
            while i < n:
                cur = lines[i]
                cs = cur.lstrip("\ufeff").rstrip("\r\n")
                if cs == MARKER_CLOSE or cs.startswith(MARKER_CLOSE + " ") or cs.startswith(
                    MARKER_CLOSE + "\t"
                ):
                    i += 1
                    break
                if line_is_marker(cur):
                    i += 1
                    continue
                out.append(cur)
                i += 1
            continue
        out.append(line)
        i += 1
    return "".join(out)


def resolve_and_write(path: Path) -> int:
    raw = path.read_text(encoding="utf-8")
    if not has_conflict_markers(raw):
        print(f"clean: {path}", file=sys.stderr)
        return 0
    resolved = keep_both_resolve(raw)
    if has_conflict_markers(resolved):
        print(
            f"FAIL: markers remain after keep-both resolve: {path}",
            file=sys.stderr,
        )
        return 1
    # Ensure trailing newline for markdown tips.
    if resolved and not resolved.endswith("\n"):
        resolved += "\n"
    parent = path.parent
    fd, tmp_name = tempfile.mkstemp(prefix=".fr3708-", suffix=".tmp", dir=str(parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(resolved)
        os.replace(tmp_name, path)
    except Exception:
        if os.path.exists(tmp_name):
            try:
                os.remove(tmp_name)
            except OSError:
                pass
        raise
    print(f"resolved keep-both: {path}", file=sys.stderr)
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "path",
        type=Path,
        help="Path to conflicted harvest SKILL.md (or any text file)",
    )
    args = p.parse_args(argv)
    path: Path = args.path
    if not path.is_file():
        print(f"FAIL: not a file: {path}", file=sys.stderr)
        return 1
    try:
        return resolve_and_write(path)
    except OSError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
