# DeepSeek Harness Desktop

Official dsh WebUI in a native window. This glossary is the language for the shell, what it ships, and how users get more plugins.

## Language

**壳**:
The Tauri desktop application that launches `dsh web` and embeds the official WebUI.
_Avoid_: 应用, 客户端, wrapper, desktop shell（对用户说话时）

**捆绑件**:
A piece shipped inside the installer and synced into the user's dsh profile or preset directory on launch.
_Avoid_: 内置插件, 三件套

**市场**:
The in-WebUI storefront plugin `dshmarket`. It is itself a Bundled component.
_Avoid_: 插件商店, awesome-dsh-plugin, 目录

**目录**:
The curated awesome-dsh-plugin list that names installable Community plugins (`plugins.json`).
_Avoid_: 市场, registry, awesome 列表（对内请用「目录」）

**社区插件**:
A plugin acquired through the Market, not shipped as a Bundled component.
_Avoid_: 内置插件, 第三方插件（捆绑件也可以是上游项目）

**默认安装**:
A Community plugin the Shell installs through the Market on first launch. ModLens is one.
_Avoid_: 捆绑件（默认安装不进安装包）

**降级**:
Bundled UI stays available when a default-installed Community plugin is missing. Vision settings stay; image reading does not.
_Avoid_: fallback（本项目里 fallback 指把引擎再打进安装包，已否决）

**在线更新**:
Fetching a newer Shell, dsh, Bundled component, Market, or default-installed Community plugin over the network.
_Avoid_: 升级（和 dsh 自己的版本号口语混淆）
