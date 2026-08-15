#!/usr/bin/env python3
"""Localize vendored anchored-standard preset.yml files (used by make vendor)."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

PRESET_NAME_ZH = "锚定式标准（实验）"
PRESET_DESCRIPTION_ZH = (
    "首轮使用 Minimal 的真实工具对（持久 bash + str_replace_editor），"
    "不自动注入工作区或技能上下文；首次工具调用或回复后开放完整 Standard 工具。"
)
ZERO_PRESET_NAME_ZH = "零工具锚定式标准（实验）"
ZERO_PRESET_DESCRIPTION_ZH = (
    "先插入一轮无工具的锚定对话（固定提示），从下一轮起开放完整 Standard 工具。"
)


def localize_preset_yml(text: str, name: str, description: str) -> str:
    body = text.replace("\r\n", "\n")
    if not body.endswith("\n"):
        body += "\n"
    name_line = f"name: {json.dumps(name, ensure_ascii=False)}\n"
    desc_line = f"description: {json.dumps(description, ensure_ascii=False)}\n"
    name_match = re.search(r"(?m)^name:.*\n", body)
    if name_match:
        body = body[: name_match.start()] + name_line + body[name_match.end() :]
    else:
        body = name_line + body
    desc_match = re.search(r"(?m)^description:(?:[ \t].*)?\n(?:[ \t].+\n)*", body)
    if desc_match:
        return body[: desc_match.start()] + desc_line + body[desc_match.end() :]
    name_written = re.search(r"(?m)^name:.*\n", body)
    if name_written:
        return body[: name_written.end()] + desc_line + body[name_written.end() :]
    return desc_line + body


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: localize_preset.py <preset.yml> [zero]", file=sys.stderr)
        return 2
    path = Path(argv[1])
    zero = len(argv) > 2 and argv[2] == "zero"
    name = ZERO_PRESET_NAME_ZH if zero else PRESET_NAME_ZH
    description = ZERO_PRESET_DESCRIPTION_ZH if zero else PRESET_DESCRIPTION_ZH
    path.write_text(
        localize_preset_yml(path.read_text(encoding="utf-8"), name, description),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
