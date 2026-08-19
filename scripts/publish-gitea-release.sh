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

# Gitea can finish storing an upload after its front proxy has already returned
# 504. Confirm the uploaded bytes before retrying; mere existence is not enough
# when this workflow replaces artifacts under an existing release version.
remote_matches_file() {
  local file=$1
  local url=$2
  local local_sha remote_sha
  local_sha=$(sha256sum "$file" | cut -d ' ' -f1)
  remote_sha=$(curl --fail --silent --show-error -H "$AUTH" "$url" | sha256sum | cut -d ' ' -f1) || return 1
  [[ "$remote_sha" == "$local_sha" ]]
}

upload_package() {
  local file=$1
  local url=$2
  local attempts=0
  while true; do
    if curl --fail --silent --show-error --http1.1 -H 'Expect:' -H "$AUTH" \
      --upload-file "$file" "$url" >/dev/null; then
      return 0
    fi
    if remote_matches_file "$file" "$url"; then
      echo "upload completed behind gateway timeout: $(basename "$file")" >&2
      return 0
    fi
    attempts=$((attempts + 1))
    if (( attempts >= 4 )); then
      echo "package upload failed after 4 attempts: $(basename "$file")" >&2
      return 1
    fi
    echo "package upload failed (attempt ${attempts}/3), retrying: $(basename "$file")" >&2
    sleep 10
  done
}

release_asset_matches() {
  local release_id=$1
  local file=$2
  local name=$3
  local url
  url=$(curl --fail --silent --show-error -H "$AUTH" "$API/releases/$release_id/assets" \
    | jq -r --arg name "$name" '[.[] | select(.name == $name) | .browser_download_url][0] // empty') || return 1
  [[ -n "$url" ]] && remote_matches_file "$file" "$url"
}

upload_release_asset() {
  local release_id=$1
  local file=$2
  local name=$3
  local attempts=0
  while true; do
    if curl --fail --silent --show-error --http1.1 -H 'Expect:' -H "$AUTH" \
      -F "attachment=@$file" "$API/releases/$release_id/assets?name=$name" >/dev/null; then
      return 0
    fi
    if release_asset_matches "$release_id" "$file" "$name"; then
      echo "release asset completed behind gateway timeout: $name" >&2
      return 0
    fi
    attempts=$((attempts + 1))
    if (( attempts >= 4 )); then
      echo "release asset upload failed after 4 attempts: $name" >&2
      return 1
    fi
    echo "release asset upload failed (attempt ${attempts}/3), retrying: $name" >&2
    sleep 10
  done
}

delete_package_version() {
  local url=$1
  local staging=$2
  local include_latest=$3
  local attempt file name present
  curl --silent --show-error -X DELETE -H "$AUTH" "$url" >/dev/null || true
  for attempt in $(seq 1 60); do
    present=0
    for file in "$staging"/*; do
      [[ -f "$file" ]] || continue
      name=$(basename "$file")
      if [[ "$include_latest" != 1 && "$name" == "latest.json" ]]; then
        continue
      fi
      if curl --fail --silent --show-error --head -H "$AUTH" "$url/$name" >/dev/null 2>&1; then
        present=1
        break
      fi
    done
    if (( present == 0 )); then
      return 0
    fi
    sleep 2
  done
  echo "package version was not deleted: $url" >&2
  return 1
}

delete_release_asset() {
  local release_id=$1
  local asset_id=$2
  local name=$3
  local attempt
  curl --silent --show-error -X DELETE -H "$AUTH" \
    "$API/releases/$release_id/assets/$asset_id" >/dev/null || true
  for attempt in $(seq 1 60); do
    if ! curl --fail --silent --show-error -H "$AUTH" "$API/releases/$release_id/assets" \
      | jq -e --arg name "$name" 'any(.[]; .name == $name)' >/dev/null; then
      return 0
    fi
    sleep 2
  done
  echo "release asset was not deleted: $name" >&2
  return 1
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

# Structured release body from docs/release-notes/v<version>.md; legacy
# fallback only when the file is missing (the version job normally gates it).
RELEASE_NOTES="docs/release-notes/v${RELEASE_VERSION}.md"
if [[ -f "$RELEASE_NOTES" ]]; then
  release_body=$(cat "$RELEASE_NOTES")
else
  release_body="大陆镜像安装包；文件与 GitHub Release 同源。应用内更新包由 Tauri 签名校验。"
fi

# 404 is expected when the mirror has not yet created a release for the tag;
# the create branch below handles it. Only retry transient failures, so the
# lookup itself must not go through curl_retry.
release_json=$(curl --fail --silent --show-error -H "$AUTH" "$API/releases/tags/$RELEASE_TAG" || true)
release_id=$(printf '%s' "$release_json" | jq -r '.id // empty')
if [[ -z "$release_id" ]]; then
  release_payload=$(jq -n \
    --arg tag "$RELEASE_TAG" \
    --arg name "DeepSeek Harness Desktop $RELEASE_TAG" \
    --arg body "$release_body" \
    '{tag_name:$tag,target_commitish:$tag,name:$name,body:$body,draft:false,prerelease:false}')
  release_json=$(curl_retry curl --fail --silent --show-error \
    -X POST -H "$AUTH" -H 'Content-Type: application/json' \
    --data "$release_payload" "$API/releases")
  release_id=$(printf '%s' "$release_json" | jq -r '.id')
else
  # The mirror may have synced an older, terse GitHub body; keep the Gitea
  # copy identical to the structured notes file on every publish.
  curl_retry curl --fail --silent --show-error -X PATCH -H "$AUTH" \
    -H 'Content-Type: application/json' \
    --data "$(jq -n --arg body "$release_body" '{body:$body}')" \
    "$API/releases/$release_id" >/dev/null
fi

# Versioned generic package: immutable URLs consumed by latest.json.
delete_package_version "$PACKAGE_BASE/$RELEASE_VERSION" "$STAGING_DIR" 0
for file in "$STAGING_DIR"/*; do
  [[ -f "$file" && "$(basename "$file")" != "latest.json" ]] || continue
  upload_package "$file" "$PACKAGE_BASE/$RELEASE_VERSION/$(basename "$file")"
done

# Stable updater endpoint. Gitea generic packages are immutable, so replace
# the synthetic "latest" version on each completed release.
delete_package_version "$PACKAGE_BASE/latest" "$STAGING_DIR" 1
upload_package "$STAGING_DIR/latest.json" "$PACKAGE_BASE/latest/latest.json"

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
    delete_release_asset "$release_id" "$old_id" "$name"
  fi
  upload_release_asset "$release_id" "$file" "$name"
done