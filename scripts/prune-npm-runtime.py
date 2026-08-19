#!/usr/bin/env python3
"""Remove development-only metadata from vendored npm runtime trees."""

from pathlib import Path
import sys


def prune(root: Path) -> tuple[int, int]:
    removed_files = 0
    removed_bytes = 0
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.name.endswith((".d.ts", ".map")):
            removed_bytes += path.stat().st_size
            path.unlink()
            removed_files += 1
    return removed_files, removed_bytes


def main() -> int:
    if len(sys.argv) < 2:
        print(f"usage: {Path(sys.argv[0]).name} ROOT...", file=sys.stderr)
        return 2
    total_files = 0
    total_bytes = 0
    for raw in sys.argv[1:]:
        root = Path(raw)
        if not root.is_dir():
            print(f"runtime tree not found: {root}", file=sys.stderr)
            return 1
        removed_files, removed_bytes = prune(root)
        total_files += removed_files
        total_bytes += removed_bytes
    print(f"pruned {total_files} development files ({total_bytes} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
