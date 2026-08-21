#!/usr/bin/env bash
# Fetch official dsh, ModLens, dshmarket, and Anchored Standard into vendor/
# for native Tauri resources.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DSH_VERSION="${DSH_VERSION:-0.1.0-rc.7}"
NODE_VERSION="${NODE_VERSION:-24.19.0}"
MODLENS_VERSION="${MODLENS_VERSION:-3.16.6}"
MARKET_VERSION="${MARKET_VERSION:-1.11.3}"
ANCHORED_COMMIT="${ANCHORED_COMMIT:-ffb845c5480adc953392a6db6f8a98ede621174b}"
ANCHORED_REPO="${ANCHORED_REPO:-https://github.com/xiaobright/dsh-anchored-standard.git}"
DSH_NPM_REGISTRY="${DSH_DESKTOP_NPM_REGISTRY:-https://registry.npmmirror.com}"
NPM_REGISTRY="${npm_config_registry:-https://registry.npmjs.org}"
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
MODLENS_ARCHIVE="vendor/modlens.tar.gz"
MARKET_DIR="vendor/dshmarket"
DSH_DIR="vendor/dsh-prefix"
MARKET_ARCHIVE="vendor/dshmarket.tar.gz"
DSH_ARCHIVE="vendor/dsh-prefix.tar.gz"
DSH_ARCHIVE_MAX_BYTES="${DSH_ARCHIVE_MAX_BYTES:-45000000}"


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

rm -rf "$DSH_DIR" "$DSH_ARCHIVE"
mkdir -p "$DSH_DIR"
npm_config_registry="$DSH_NPM_REGISTRY" npm install --prefix "$DSH_DIR" --global --prefer-offline --no-audit --no-fund "@deepseek-ai/dsh@${DSH_VERSION}"
"$PYTHON" scripts/prune-npm-runtime.py "$DSH_DIR"
tar -czf "$DSH_ARCHIVE" -C "$DSH_DIR" .
test "$(wc -c < "$DSH_ARCHIVE")" -le "$DSH_ARCHIVE_MAX_BYTES"
NODE_VERSION="$NODE_VERSION" bash scripts/vendor-node-runtime.sh

rm -rf "$MODLENS_DIR" "$MODLENS_ARCHIVE"
mkdir -p "$MODLENS_DIR"
npm_config_registry="$NPM_REGISTRY" npm install --prefix "$MODLENS_DIR" --prefer-offline --no-audit --no-fund "@liustack/modlens@${MODLENS_VERSION}"
"$PYTHON" scripts/prune-npm-runtime.py "$MODLENS_DIR"
tar -czf "$MODLENS_ARCHIVE" -C "$MODLENS_DIR" .

rm -rf "$MARKET_DIR" "$MARKET_ARCHIVE"
mkdir -p "$MARKET_DIR"
npm_config_registry="$NPM_REGISTRY" npm install --prefix "$MARKET_DIR" --prefer-offline --no-audit --no-fund "dshmarket@${MARKET_VERSION}"
"$PYTHON" scripts/patch-dshmarket-mainland.py
"$PYTHON" scripts/prune-npm-runtime.py "$MARKET_DIR"
tar -czf "$MARKET_ARCHIVE" -C "$MARKET_DIR" .

test -f "$DSH_DIR/lib/node_modules/@deepseek-ai/dsh/package.json" || test -f "$DSH_DIR/node_modules/@deepseek-ai/dsh/package.json"
test -f "$DSH_ARCHIVE"
test -f vendor/node-runtime.tar.gz
test -f vendor/node-runtime.version
test -f "$MODLENS_ARCHIVE"
test -f "$MARKET_ARCHIVE"
test -f "$ANCHORED_DIR/preset.yml"
test -f "$ZERO_DIR/preset.yml"
test -d "$MODLENS_DIR/node_modules/@liustack/modlens"
test -d "$MARKET_DIR/node_modules/dshmarket"
echo "vendored dsh ${DSH_VERSION}, Node.js ${NODE_VERSION}, ModLens ${MODLENS_VERSION}, dshmarket ${MARKET_VERSION}, and Anchored Standard ${ANCHORED_COMMIT}"
