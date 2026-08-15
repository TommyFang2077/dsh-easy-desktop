#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/screenshots"
SRC="$OUT/src"
CHROME="${CHROME:-google-chrome}"

capture() {
  local name="$1"
  local html="$2"
  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --no-sandbox \
    --hide-scrollbars \
    --force-device-scale-factor=2 \
    --window-size=1280,800 \
    --default-background-color=00000000 \
    --screenshot="$OUT/$name.png" \
    "file://$html"
  echo "wrote $OUT/$name.png"
}

capture_banner() {
  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --no-sandbox \
    --hide-scrollbars \
    --force-device-scale-factor=2 \
    --window-size=1920,960 \
    --default-background-color=00000000 \
    --screenshot="$OUT/banner.png" \
    "file://$SRC/banner.html"
  echo "wrote $OUT/banner.png"
}

mkdir -p "$OUT"
capture splash "$SRC/splash.html"
capture session "$SRC/session.html"
capture vision "$SRC/vision.html"
capture menu "$SRC/menu.html"
capture_banner
cp -f "$ROOT/ui/icon.png" "$OUT/icon.png"
