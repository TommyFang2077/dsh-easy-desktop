# Third-party notices

DeepSeek Harness Desktop (this repository) is MIT-licensed. It is a native
shell around other projects. Those projects keep their own copyright and
license. Copies of the relevant texts live in `docs/licenses/`.

This project is **not** affiliated with, endorsed by, or maintained by
DeepSeek, liustack, xiaobright, or AgentRQ.

## Bundled or launched at runtime

| Component | Upstream | Version / pin | License | How this app uses it |
| --- | --- | --- | --- | --- |
| DeepSeek Harness (`@deepseek-ai/dsh`) | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | `0.1.0-rc.6` | MIT, © 2026 DeepSeek | Official WebUI. Not shipped as source. Flatpak vendors the npm package; other packages call a host `dsh`. See `docs/licenses/deepseek-harness.LICENSE`. |
| ModLens (`@liustack/modlens`) | [liustack/modlens](https://github.com/liustack/modlens) | `3.16.6` | MIT, © 2026 Leon Liu (liustack) | Copied into `~/.dsh/profiles/web` so text-only models can read images. See `docs/licenses/modlens.LICENSE`. |
| Anchored Standard | [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) | commit `ffb845c5480adc953392a6db6f8a98ede621174b` | MIT, © 2026 xiaobright; portions © 2026 DeepSeek | Localized as **锚定式标准（实验）** and **零工具锚定式标准（实验）**, written to `~/.dsh/.agent-presets/`. See `docs/licenses/dsh-anchored-standard.LICENSE` and `.NOTICE`. |
| `dsh-desktop-vision` | this repo `plugins/dsh-desktop-vision/` | `0.1.4` | MIT, © 2026 TommyFang2077 | Settings page **设置 → 视觉模型**; writes `~/.modlens/config.json`. |
| AgentRQ (`agentrq`) | [agentrq/agentrq](https://github.com/agentrq/agentrq) | `0.2.1` | Apache-2.0 | Copied into `~/.dsh/profiles/web` so Harness can manage AgentRQ tasks. Idle until `AGENTRQ_WORKSPACE_MCP_URL` or the profile `url` is set. See `docs/licenses/agentrq.LICENSE`. |

The Anchored Standard NOTICE records that the presets adapt the DeepSeek
Harness Standard agent preset from
https://github.com/deepseek-ai/deepseek-harness
(commit `47f943859bef60e4160492346772ded9b24f765a`).

## App icon

The application icon is the [Icons8 DeepSeek icon](https://icons8.com/icon/YWOidjGxCpFW/deepseek).
DeepSeek and the whale mark belong to their owners.

## Tauri and system WebView

The window is built with [Tauri 2](https://tauri.app/) (MIT / Apache-2.0) and
the platform WebView (WebKitGTK 4.1, WKWebView, or WebView2). Those components
are linked or bundled by the respective platform toolchains, not copied into
this source tree.
