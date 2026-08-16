#!/usr/bin/env bash
# Publish normalized installers and signed updater artifacts to Gitea.
set -euo pipefail

STAGING_DIR="${1:?usage: publish-gitea-release.sh STAGING_DIR}"
: "${GITEA_TOKEN:?GITEA_TOKEN is required}"
: "${GITEA_BASE_URL:?GITEA_BASE_URL is required}"
: "${GITEA_OWNER:?GITEA_OWNER is required}"
: "${GITEA_REPO:?GITEA_REPO is required}"
: "${RELEASE_TAG:?RELEASE_TAG is required}"
: "${RELEASE_VERSION:?RELEASE_VERSION is required}"

API="${GITEA_BASE_URL%/}/api/v1/repos/${GITEA_OWNER}/${GITEA_REPO}"
PACKAGE_BASE="${GITEA_BASE_URL%/}/api/packages/${GITEA_OWNER}/generic/dsh-easy-desktop-updater"
AUTH="Authorization: token ${GITEA_TOKEN}"

# Retry transient gateway errors (504) coming from the front proxy while the
# NAS reaches github.com over a mainland link: requests can stall past the
# proxy read timeout. 404s are NOT retried here (release/package state).
curl_retry() {
  local attempts=0
  while ! "$@"; do
    attempts=$((attempts + 1))
    if (( attempts >= 4 )); then
      echo "curl failed after 4 attempts: $*" >&2
      return 1
    fi
    echo "curl transient failure (attempt ${attempts}/3), retrying: $*" >&2
    sleep 10
  done
}

# The Gitea repository is a pull mirror. Kick a background sync; the trigger
# response itself is irrelevant (it can 504 while the sync runs on Gitea).
# The tag poll below is the actual gate.
curl --silent --show-error -X POST -H "$AUTH" "$API/mirror-sync" >/dev/null || true

# Wait (up to 10 min) until the tag has synced; then fail loudly if it never did.
for _ in $(seq 1 60); do
  if curl --fail --silent --show-error -H "$AUTH" "$API/tags/$RELEASE_TAG" >/dev/null 2>&1; then
    synced=1
    break
  fi
  sleep 10
done
[[ "${synced:-0}" == 1 ]] || {
  echo "tag $RELEASE_TAG did not appear on the Gitea mirror after 10 minutes" >&2
  exit 1
}

release_json=$(curl_retry curl --fail --silent --show-error -H "$AUTH" "$API/releases/tags/$RELEASE_TAG")
release_id=$(printf '%s' "$release_json" | jq -r '.id // empty')
if [[ -z "$release_id" ]]; then
  release_payload=$(jq -n \
    --arg tag "$RELEASE_TAG" \
    --arg name "DeepSeek Harness Desktop $RELEASE_TAG" \
    --arg body "大陆镜像安装包；文件与 GitHub Release 同源。应用内更新包由 Tauri 签名校验。" \
    '{tag_name:$tag,target_commitish:$tag,name:$name,body:$body,draft:false,prerelease:false}')
  release_json=$(curl_retry curl --fail --silent --show-error \
    -X POST -H "$AUTH" -H 'Content-Type: application/json' \
    --data "$release_payload" "$API/releases")
  release_id=$(printf '%s' "$release_json" | jq -r '.id')
fi

# Versioned generic package: immutable URLs consumed by latest.json.
curl --silent --show-error -X DELETE -H "$AUTH" \
  "$PACKAGE_BASE/$RELEASE_VERSION" >/dev/null || true
for file in "$STAGING_DIR"/*; do
  [[ -f "$file" && "$(basename "$file")" != "latest.json" ]] || continue
  curl_retry curl --fail --silent --show-error -H "$AUTH" --upload-file "$file" \
    "$PACKAGE_BASE/$RELEASE_VERSION/$(basename "$file")" >/dev/null
done

# Stable updater endpoint. Gitea generic packages are immutable, so replace
# the synthetic "latest" version on each completed release.
curl --silent --show-error -X DELETE -H "$AUTH" "$PACKAGE_BASE/latest" >/dev/null || true
curl_retry curl --fail --silent --show-error -H "$AUTH" --upload-file "$STAGING_DIR/latest.json" \
  "$PACKAGE_BASE/latest/latest.json" >/dev/null

assets=$(curl_retry curl --fail --silent --show-error -H "$AUTH" "$API/releases/$release_id/assets")
for file in "$STAGING_DIR"/*; do
  [[ -f "$file" ]] || continue
  name=$(basename "$file")
  case "$name" in
    *.dmg|*.deb|*.rpm|*.exe|*.msi|*.AppImage|*.flatpak) ;;
    *) continue ;;
  esac
  old_id=$(printf '%s' "$assets" | jq -r --arg name "$name" '[.[] | select(.name == $name) | .id][0] // empty')
  if [[ -n "$old_id" ]]; then
    curl_retry curl --fail --silent --show-error -X DELETE -H "$AUTH" \
      "$API/releases/$release_id/assets/$old_id" >/dev/null
  fi
  curl_retry curl --fail --silent --show-error -H "$AUTH" \
    -F "attachment=@$file" "$API/releases/$release_id/assets?name=$name" >/dev/null
done