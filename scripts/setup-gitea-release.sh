#!/usr/bin/env bash
# Interactive one-time setup for Gitea publishing and Tauri update signing.
set -euo pipefail

BOLD='\033[1m'
DIM='\033[2m'
RED='\033[31m'
GREEN='\033[32m'
RESET='\033[0m'
GITEA_BASE_URL='https://git.fangsiyuan.top'
GITEA_OWNER='TomHanck4'
GITEA_REPO='dsh-easy-desktop'

step() {
  printf '\n%b%s%b\n' "$BOLD" "$1" "$RESET"
  printf '%b%s%b\n\n' "$DIM" "$2" "$RESET"
}

confirm() {
  local answer
  read -r -p "$1 [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

need() {
  command -v "$1" >/dev/null 2>&1 || {
    printf '%b缺少命令：%s%b\n' "$RED" "$1" "$RESET" >&2
    exit 1
  }
}

need curl
need gh
need jq

printf '%bGitea 大陆发行通道设置%b\n' "$BOLD" "$RESET"
printf '共 3 步：验证 Gitea → 配置签名 → 写入 GitHub Secrets\n'

step '1/3  验证 Gitea' '需要一个可写入 TomHanck4/dsh-easy-desktop 发行版与 Generic Package 的 Gitea token。'
printf '%bHTTPS 已启用：%btoken 与发行包传输均受 TLS 保护。\n' "$GREEN" "$RESET"
read -r -s -p '粘贴 Gitea token: ' GITEA_TOKEN
printf '\n'
[[ -n "$GITEA_TOKEN" ]] || { printf '%btoken 不能为空%b\n' "$RED" "$RESET" >&2; exit 1; }
AUTH="Authorization: token $GITEA_TOKEN"
user=$(curl --fail --silent --show-error -H "$AUTH" "$GITEA_BASE_URL/api/v1/user")
repo=$(curl --fail --silent --show-error -H "$AUTH" "$GITEA_BASE_URL/api/v1/repos/$GITEA_OWNER/$GITEA_REPO")
printf '已认证：%s；仓库：%s\n' "$(printf '%s' "$user" | jq -r .login)" "$(printf '%s' "$repo" | jq -r .full_name)"
[[ "$(printf '%s' "$repo" | jq -r .mirror)" == 'true' ]] || {
  printf '%b仓库不是 pull mirror，发布脚本无法同步 GitHub tag。%b\n' "$RED" "$RESET" >&2
  exit 1
}

step '2/3  配置 Tauri 签名' '已有密钥可复用；否则向导通过 Tauri CLI 在 ~/.tauri 生成。私钥不会写入仓库。'
if confirm '已有 Tauri updater 私钥吗？'; then
  read -r -e -p '私钥路径: ' PRIVATE_KEY_PATH
  read -r -e -p '公钥路径: ' PUBLIC_KEY_PATH
  read -r -s -p '私钥密码（没有则留空）: ' SIGNING_PASSWORD
  printf '\n'
else
  need npx
  PRIVATE_KEY_PATH="$HOME/.tauri/dsh-easy-desktop.key"
  PUBLIC_KEY_PATH="$PRIVATE_KEY_PATH.pub"
  mkdir -p "$(dirname "$PRIVATE_KEY_PATH")"
  read -r -s -p '设置私钥密码（可留空）: ' SIGNING_PASSWORD
  printf '\n正在生成签名密钥…\n'
  npm_config_registry='https://registry.npmmirror.com' \
    npx --yes @tauri-apps/cli@2 signer generate --ci --password "$SIGNING_PASSWORD" -w "$PRIVATE_KEY_PATH"
fi
[[ -f "$PRIVATE_KEY_PATH" ]] || { printf '%b找不到私钥：%s%b\n' "$RED" "$PRIVATE_KEY_PATH" "$RESET" >&2; exit 1; }
[[ -f "$PUBLIC_KEY_PATH" ]] || { printf '%b找不到公钥：%s%b\n' "$RED" "$PUBLIC_KEY_PATH" "$RESET" >&2; exit 1; }
chmod 600 "$PRIVATE_KEY_PATH"
printf '私钥：%s\n公钥：%s\n' "$PRIVATE_KEY_PATH" "$PUBLIC_KEY_PATH"

step '3/3  写入 GitHub Secrets' 'gh 会把四项机密直接写到当前仓库；终端不会打印 secret 内容。'
gh auth status >/dev/null
confirm '现在写入 GITEA_TOKEN 与 Tauri 签名 secrets 吗？' || exit 1
printf '%s' "$GITEA_TOKEN" | gh secret set GITEA_TOKEN
cat "$PRIVATE_KEY_PATH" | gh secret set TAURI_SIGNING_PRIVATE_KEY
cat "$PUBLIC_KEY_PATH" | gh secret set DSH_DESKTOP_UPDATER_PUBKEY
if [[ -n "$SIGNING_PASSWORD" ]]; then
  printf '%s' "$SIGNING_PASSWORD" | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
fi
unset GITEA_TOKEN SIGNING_PASSWORD AUTH

printf '\n%b设置完成。%b 下次推送 v* tag 时，Release 工作流会发布 GitHub 与 Gitea 两套安装包。\n' "$GREEN" "$RESET"
printf '首个版本发布后检查：%s/%s/%s/releases/latest\n' "$GITEA_BASE_URL" "$GITEA_OWNER" "$GITEA_REPO"
