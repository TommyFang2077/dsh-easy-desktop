#!/usr/bin/env bash
# Fetch ModLens, dshmarket, and Anchored Standard into vendor/ for Tauri resources.
# Does not vendor @deepseek-ai/dsh (that is Flatpak-only; see `make vendor`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODLENS_VERSION="${MODLENS_VERSION:-3.16.6}"
MARKET_VERSION="${MARKET_VERSION:-1.9.0}"
ANCHORED_COMMIT="${ANCHORED_COMMIT:-ffb845c5480adc953392a6db6f8a98ede621174b}"
ANCHORED_REPO="${ANCHORED_REPO:-https://github.com/xiaobright/dsh-anchored-standard.git}"
if [ -z "${PYTHON:-}" ]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON=python3
  else
    PYTHON=python
  fi
fi

ANCHORED_DIR="vendor/anchored-standard"
ZERO_DIR="vendor/zero-anchored-standard"
MODLENS_DIR="vendor/modlens"
MARKET_DIR="vendor/dshmarket"

rm -rf vendor/.anchored-src "$ANCHORED_DIR" "$ZERO_DIR"
mkdir -p vendor/.anchored-src
git -C vendor/.anchored-src init --initial-branch=main
git -C vendor/.anchored-src remote add origin "$ANCHORED_REPO"
git -C vendor/.anchored-src fetch --depth 1 origin "$ANCHORED_COMMIT"
git -C vendor/.anchored-src checkout --detach FETCH_HEAD
mkdir -p "$ANCHORED_DIR" "$ZERO_DIR"
cp -R vendor/.anchored-src/preset/. "$ANCHORED_DIR/"
cp -R vendor/.anchored-src/zero-anchored-standard/. "$ZERO_DIR/"
cp vendor/.anchored-src/LICENSE vendor/.anchored-src/NOTICE "$ANCHORED_DIR/"
cp vendor/.anchored-src/LICENSE vendor/.anchored-src/NOTICE "$ZERO_DIR/"
printf '%s\n' "$ANCHORED_COMMIT" > "$ANCHORED_DIR/.dsh-desktop-source"
printf '%s\n' "$ANCHORED_COMMIT" > "$ZERO_DIR/.dsh-desktop-source"
"$PYTHON" scripts/localize_preset.py "$ANCHORED_DIR/preset.yml"
"$PYTHON" scripts/localize_preset.py "$ZERO_DIR/preset.yml" zero
rm -rf vendor/.anchored-src

rm -rf "$MODLENS_DIR"
mkdir -p "$MODLENS_DIR"
npm install --prefix "$MODLENS_DIR" --prefer-offline --no-audit --no-fund "@liustack/modlens@${MODLENS_VERSION}"

rm -rf "$MARKET_DIR"
mkdir -p "$MARKET_DIR"
npm install --prefix "$MARKET_DIR" --prefer-offline --no-audit --no-fund "dshmarket@${MARKET_VERSION}"
"$PYTHON" scripts/patch-dshmarket-mainland.py

test -f "$ANCHORED_DIR/preset.yml"
test -f "$ZERO_DIR/preset.yml"
test -d "$MODLENS_DIR/node_modules/@liustack/modlens"
test -d "$MARKET_DIR/node_modules/dshmarket"
echo "vendored ModLens ${MODLENS_VERSION}, dshmarket ${MARKET_VERSION}, and Anchored Standard ${ANCHORED_COMMIT}"
