#!/usr/bin/env bash
# Download and archive the official platform Node.js runtime used by bundled dsh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE_VERSION="${NODE_VERSION:-24.19.0}"
NODE_RUNTIME_PLATFORM="${NODE_RUNTIME_PLATFORM:-}"
NODE_DIR="vendor/node-runtime"
NODE_ARCHIVE="vendor/node-runtime.tar.gz"
NODE_VERSION_FILE="vendor/node-runtime.version"

mkdir -p "$(dirname "$NODE_DIR")"
if [ -z "$NODE_RUNTIME_PLATFORM" ]; then
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) NODE_RUNTIME_PLATFORM="darwin-arm64" ;;
    Darwin-x86_64) NODE_RUNTIME_PLATFORM="darwin-x64" ;;
    Linux-x86_64) NODE_RUNTIME_PLATFORM="linux-x64" ;;
    Linux-aarch64) NODE_RUNTIME_PLATFORM="linux-arm64" ;;
    MINGW*|MSYS*|CYGWIN*) NODE_RUNTIME_PLATFORM="win-x64" ;;
    *)
      echo "unsupported Node runtime host: $(uname -s)-$(uname -m); set NODE_RUNTIME_PLATFORM" >&2
      exit 2
      ;;
  esac
fi

case "$NODE_RUNTIME_PLATFORM" in
  win-x64|win-arm64) extension="zip" ;;
  darwin-x64|darwin-arm64|linux-x64|linux-arm64) extension="tar.gz" ;;
  *)
    echo "unsupported Node runtime platform: $NODE_RUNTIME_PLATFORM" >&2
    exit 2
    ;;
esac

archive_name="node-v${NODE_VERSION}-${NODE_RUNTIME_PLATFORM}.${extension}"
dist_url="https://nodejs.org/dist/v${NODE_VERSION}/${archive_name}"
work_dir="$(mktemp -d)"
cleanup() { rm -rf "$work_dir"; }
trap cleanup EXIT

curl -fsSL "$dist_url" -o "$work_dir/$archive_name"
expected="$(curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" | awk -v name="$archive_name" '$2 == name { print $1 }')"
if [ -z "$expected" ]; then
  echo "missing official SHA-256 entry for $archive_name" >&2
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$work_dir/$archive_name" | awk '{ print $1 }')"
elif command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$work_dir/$archive_name" | awk '{ print $1 }')"
else
  echo "sha256sum or shasum is required to verify Node.js runtime" >&2
  exit 2
fi
if [ "$actual" != "$expected" ]; then
  echo "Node.js runtime checksum mismatch for $archive_name" >&2
  exit 1
fi

if [ "$extension" = "zip" ]; then
  if command -v unzip >/dev/null 2>&1; then
    unzip -q "$work_dir/$archive_name" -d "$work_dir"
  else
    tar -xf "$work_dir/$archive_name" -C "$work_dir"
  fi
else
  tar -xzf "$work_dir/$archive_name" -C "$work_dir"
fi

runtime_root="$work_dir/node-v${NODE_VERSION}-${NODE_RUNTIME_PLATFORM}"
case "$NODE_RUNTIME_PLATFORM" in
  win-*)
    test -f "$runtime_root/node.exe"
    test -f "$runtime_root/npm.cmd"
    ;;
  *)
    test -x "$runtime_root/bin/node"
    test -x "$runtime_root/bin/npm"
    ;;
esac

rm -rf "$NODE_DIR" "$NODE_ARCHIVE"
mv "$runtime_root" "$NODE_DIR"
printf '%s\n' "$NODE_VERSION" > "$NODE_DIR/.dsh-desktop-node-version"
printf '%s\n' "$NODE_VERSION" > "$NODE_VERSION_FILE"
tar -czf "$NODE_ARCHIVE" -C "$NODE_DIR" .

test -s "$NODE_ARCHIVE"
echo "vendored Node.js ${NODE_VERSION} for ${NODE_RUNTIME_PLATFORM}"
