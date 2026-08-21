#!/usr/bin/env bash
# Gitea Actions publisher: download a GitHub release's assets and publish
# them to the local Gitea instance over the LAN interface (bypassing the
# public reverse proxy, which times out on large uploads).
set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-TommyFang2077/dsh-easy-desktop}"
REPO_OWNER="${GITEA_OWNER:-TomHanck4}"
REPO_NAME="${GITEA_REPO:-dsh-easy-desktop}"
export GITEA_OWNER="$REPO_OWNER"
export GITEA_REPO="$REPO_NAME"
GITEA_BASE_URL="${GITEA_BASE_URL:-http://192.168.30.33:3000}"
PACKAGE_BASE_URL="${PACKAGE_BASE_URL:-https://git.fangsiyuan.top/api/packages/TomHanck4/generic/dsh-easy-desktop-updater}"
RELEASE_TAG="${RELEASE_TAG:-${GITHUB_REF#refs/tags/}}"
: "${GITEA_TOKEN:?GITEA_TOKEN is required}"

if [[ -z "$RELEASE_TAG" || "$RELEASE_TAG" == "latest" ]]; then
  RELEASE_TAG=$(curl -fsS "https://api.github.com/repos/$GITHUB_REPO/releases?per_page=1" | jq -r '.[0].tag_name')
fi
[[ -n "$RELEASE_TAG" && "$RELEASE_TAG" != "null" ]] || {
  echo "no GitHub release tag available" >&2
  exit 1
}
VERSION="${RELEASE_TAG#v}"
export RELEASE_VERSION="$VERSION"
echo "target: $RELEASE_TAG ($VERSION)"
echo "gitea:   $GITEA_BASE_URL"

if curl -fsS -H "Authorization: token $GITEA_TOKEN" \
  "$GITEA_BASE_URL/api/packages/$REPO_OWNER/generic/dsh-easy-desktop-updater/latest/latest.json" -o /tmp/latest.json 2>/dev/null \
  && [ "$(jq -r '.version' /tmp/latest.json)" = "$VERSION" ]; then
  echo "version $VERSION already published on the Gitea feed; nothing to do"
  exit 0
fi

rm -rf artifacts staged
mkdir -p artifacts

for attempt in $(seq 1 90); do
  if curl -fsS "https://api.github.com/repos/$GITHUB_REPO/releases/tags/$RELEASE_TAG" -o /tmp/release.json; then
    jq -r '.assets[].browser_download_url' /tmp/release.json > /tmp/asset-urls.txt
    if [ "$(wc -l < /tmp/asset-urls.txt)" -ge 15 ]; then
      break
    fi
  fi
  echo "waiting for GitHub release assets for $RELEASE_TAG (attempt ${attempt}/90)" >&2
  sleep 20
done
[ "$(wc -l < /tmp/asset-urls.txt 2>/dev/null || echo 0)" -ge 15 ] || {
  echo "GitHub release $RELEASE_TAG did not publish all installer assets within 30 minutes" >&2
  exit 1
}
while read -r url; do
  curl -fsSL --retry 3 --retry-delay 5 -o "artifacts/$(basename "$url")" "$url" &
done < /tmp/asset-urls.txt
wait
COUNT=$(find artifacts -type f | wc -l)
echo "downloaded $COUNT assets"
[ "$COUNT" -ge 15 ] || {
  echo "expected at least 15 release assets, got $COUNT" >&2
  exit 1
}

python3 scripts/build-gitea-update.py \
  --flat-artifacts artifacts \
  --output staged \
  --version "$VERSION" \
  --pub-date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --package-base-url "$PACKAGE_BASE_URL"

bash scripts/publish-gitea-release.sh staged
echo "published $RELEASE_TAG to Gitea"