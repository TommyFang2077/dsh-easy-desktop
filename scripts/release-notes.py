#!/usr/bin/env python3
"""Extract release-copy fragments from a structured per-version notes file.

Notes live under docs/release-notes/v<version>.md in this layout:

    # DeepSeek Harness Desktop v0.1.2

    **摘要 / Summary:** one short bilingual paragraph …

    ## 新功能 / Features
    - …

    ## 修复 / Fixes
    - …

    ## 安装与更新 / Install & Update
    - …

Subcommands:
    body FILE   the full file (GitHub / Gitea release body)
    notes FILE  the 摘要 / Summary paragraph, one line (in-app update notes)
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

TITLE_RE = re.compile(r"^# .+$", re.M)
SUMMARY_RE = re.compile(r"^\*\*摘要\s*/\s*Summary:\*\*\s*(.+)$", re.M)


def load(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if TITLE_RE.search(text) is None:
        raise SystemExit(f"{path}: expected a '# ' title line")
    return text


def read_body(path: Path) -> str:
    text = load(path)
    if not text.endswith("\n"):
        text += "\n"
    return text


def read_notes(path: Path) -> str:
    text = load(path)
    match = SUMMARY_RE.search(text)
    if match is None:
        raise SystemExit(f"{path}: missing '**摘要 / Summary:**' line")
    return match.group(1).strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("subcommand", choices=["body", "notes"])
    parser.add_argument("file")
    args = parser.parse_args()
    out = read_body(Path(args.file)) if args.subcommand == "body" else read_notes(Path(args.file))
    sys.stdout.write(out if out.endswith("\n") else out + "\n")


if __name__ == "__main__":
    main()