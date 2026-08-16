#!/usr/bin/env python3
"""Normalize Tauri artifacts and build the static updater manifest."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

MATRIX_TARGETS = {
    "gitea-macos-arm64": ("darwin", "aarch64"),
    "gitea-macos-x64": ("darwin", "x86_64"),
    "gitea-linux": ("linux", "x86_64"),
    "gitea-windows": ("windows", "x86_64"),
    "gitea-flatpak": ("linux", "x86_64"),
}
DELIVERABLE_SUFFIXES = (
    ".app.tar.gz.sig",
    ".app.tar.gz",
    ".AppImage.sig",
    ".AppImage",
    ".flatpak",
    ".dmg",
    ".deb",
    ".rpm",
    ".exe.sig",
    ".exe",
    ".msi.sig",
    ".msi",
)
UPDATER_SUFFIX = {
    "darwin": ".app.tar.gz",
    "linux": ".AppImage",
    "windows": ".exe",
}
INSTALLER_KIND = {
    "darwin": "app",
    "linux": "appimage",
    "windows": "nsis",
}


def artifact_target(path: Path, root: Path) -> tuple[str, str] | None:
    relative = path.relative_to(root)
    for part in relative.parts:
        if part in MATRIX_TARGETS:
            return MATRIX_TARGETS[part]
    return None


def deliverable_suffix(name: str) -> str | None:
    return next((suffix for suffix in DELIVERABLE_SUFFIXES if name.endswith(suffix)), None)


def stage_artifacts(source: Path, output: Path, version: str) -> dict[tuple[str, str, str], Path]:
    output.mkdir(parents=True, exist_ok=True)
    staged: dict[tuple[str, str, str], Path] = {}
    for path in sorted(source.rglob("*")):
        if not path.is_file():
            continue
        target = artifact_target(path, source)
        suffix = deliverable_suffix(path.name)
        if target is None or suffix is None:
            continue
        os_name, arch = target
        key = (os_name, arch, suffix)
        if key in staged:
            raise ValueError(f"duplicate {os_name}-{arch}{suffix}: {staged[key]} and {path}")
        destination = output / f"dsh-easy-desktop_{version}_{os_name}_{arch}{suffix}"
        shutil.copy2(path, destination)
        staged[key] = destination
    return staged


def build_manifest(
    staged: dict[tuple[str, str, str], Path],
    version: str,
    package_base_url: str,
    notes: str,
    pub_date: str | None,
) -> dict[str, object]:
    platforms: dict[str, dict[str, str]] = {}
    for (os_name, arch, suffix), artifact in staged.items():
        if suffix != UPDATER_SUFFIX.get(os_name):
            continue
        signature = staged.get((os_name, arch, suffix + ".sig"))
        if signature is None:
            raise ValueError(f"missing signature for {artifact.name}")
        entry = {
            "url": f"{package_base_url.rstrip('/')}/{version}/{artifact.name}",
            "signature": signature.read_text(encoding="utf-8").strip(),
        }
        platforms[f"{os_name}-{arch}-{INSTALLER_KIND[os_name]}"] = entry
        platforms[f"{os_name}-{arch}"] = entry
    required = {"darwin-aarch64", "darwin-x86_64", "linux-x86_64", "windows-x86_64"}
    missing = required.difference(platforms)
    if missing:
        raise ValueError(f"missing updater targets: {', '.join(sorted(missing))}")
    manifest: dict[str, object] = {
        "version": version,
        "notes": notes,
        "platforms": platforms,
    }
    if pub_date:
        manifest["pub_date"] = pub_date
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifacts", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--package-base-url", required=True)
    parser.add_argument("--notes", default="DeepSeek Harness Desktop update")
    parser.add_argument("--pub-date")
    args = parser.parse_args()

    staged = stage_artifacts(args.artifacts, args.output, args.version)
    manifest = build_manifest(
        staged,
        args.version,
        args.package_base_url,
        args.notes,
        args.pub_date,
    )
    (args.output / "latest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
