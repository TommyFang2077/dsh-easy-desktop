#!/usr/bin/env python3
"""Reject missing or malformed Windows installer artifacts after a Tauri build."""

from __future__ import annotations

import argparse
from pathlib import Path


def require_magic(path: Path, magic: bytes) -> None:
    if path.stat().st_size == 0:
        raise SystemExit(f"empty installer artifact: {path}")
    with path.open("rb") as file:
        if file.read(len(magic)) != magic:
            raise SystemExit(f"unexpected installer signature: {path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("bundle", type=Path)
    args = parser.parse_args()

    nsis = list(args.bundle.rglob("*.exe"))
    msi = list(args.bundle.rglob("*.msi"))
    if len(nsis) != 1 or len(msi) != 1:
        raise SystemExit(f"expected one NSIS .exe and one .msi under {args.bundle}")
    require_magic(nsis[0], b"MZ")
    require_magic(msi[0], bytes.fromhex("D0CF11E0A1B11AE1"))


if __name__ == "__main__":
    main()
