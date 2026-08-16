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

# The Gitea repository is a pull mirror. Sync the GitHub tag before creating
# the matching Gitea release, then wait until the tag is queryable.
curl --fail --silent --show-error -X POST -H "$AUTH" "$API/mirror-sync" >/dev/null
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error -H "$AUTH" "$API/tags/$RELEASE_TAG" >/dev/null 2>&1; then
    break
  fi
  sleep 10
done
curl --fail --silent --show-error -H "$AUTH" "$API/tags/$RELEASE_TAG" >/dev/null

release_json=$(curl --silent --show-error -H "$AUTH" "$API/releases/tags/$RELEASE_TAG")
release_id=$(printf '%s' "$release_json" | jq -r '.id // empty')
if [[ -z "$release_id" ]]; then
  release_payload=$(jq -n \
    --arg tag "$RELEASE_TAG" \
    --arg name "DeepSeek Harness Desktop $RELEASE_TAG" \
    --arg body "大陆镜像安装包；文件与 GitHub Release 同源。应用内更新包由 Tauri 签名校验。" \
    '{tag_name:$tag,target_commitish:$tag,name:$name,body:$body,draft:false,prerelease:false}')
  release_json=$(curl --fail --silent --show-error \
    -X POST -H "$AUTH" -H 'Content-Type: application/json' \
    --data "$release_payload" "$API/releases")
  release_id=$(printf '%s' "$release_json" | jq -r '.id')
fi

# Versioned generic package: immutable URLs consumed by latest.json.
curl --silent --show-error -X DELETE -H "$AUTH" \
  "$PACKAGE_BASE/$RELEASE_VERSION" >/dev/null || true
for file in "$STAGING_DIR"/*; do
  [[ -f "$file" && "$(basename "$file")" != "latest.json" ]] || continue
  curl --fail --silent --show-error -H "$AUTH" --upload-file "$file" \
    "$PACKAGE_BASE/$RELEASE_VERSION/$(basename "$file")" >/dev/null
done

# Stable updater endpoint. Gitea generic packages are immutable, so replace
# the synthetic "latest" version on each completed release.
curl --silent --show-error -X DELETE -H "$AUTH" "$PACKAGE_BASE/latest" >/dev/null || true
curl --fail --silent --show-error -H "$AUTH" --upload-file "$STAGING_DIR/latest.json" \
  "$PACKAGE_BASE/latest/latest.json" >/dev/null

assets=$(curl --fail --silent --show-error -H "$AUTH" "$API/releases/$release_id/assets")
for file in "$STAGING_DIR"/*; do
  [[ -f "$file" ]] || continue
  name=$(basename "$file")
  case "$name" in
    *.dmg|*.deb|*.rpm|*.exe|*.msi|*.AppImage|*.flatpak) ;;
    *) continue ;;
  esac
  old_id=$(printf '%s' "$assets" | jq -r --arg name "$name" '[.[] | select(.name == $name) | .id][0] // empty')
  if [[ -n "$old_id" ]]; then
    curl --fail --silent --show-error -X DELETE -H "$AUTH" \
      "$API/releases/$release_id/assets/$old_id" >/dev/null
  fi
  curl --fail --silent --show-error -H "$AUTH" \
    -F "attachment=@$file" "$API/releases/$release_id/assets?name=$name" >/dev/null
done
