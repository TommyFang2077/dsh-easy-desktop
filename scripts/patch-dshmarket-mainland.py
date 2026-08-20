#!/usr/bin/env python3
"""Apply the downstream mainland-connectivity warning to vendored dshmarket."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MARKET = ROOT / "vendor" / "dshmarket" / "node_modules" / "dshmarket"


def insert_after(path: Path, anchor: str, addition: str) -> None:
    text = path.read_text(encoding="utf-8")
    if addition.strip() in text:
        return
    if text.count(anchor) != 1:
        raise RuntimeError(f"expected one patch anchor in {path}: {anchor!r}")
    path.write_text(text.replace(anchor, anchor + addition), encoding="utf-8")


def insert_before(path: Path, anchor: str, addition: str) -> None:
    text = path.read_text(encoding="utf-8")
    if addition.strip() in text:
        return
    if text.count(anchor) != 1:
        raise RuntimeError(f"expected one patch anchor in {path}: {anchor!r}")
    path.write_text(text.replace(anchor, addition + anchor), encoding="utf-8")


def main() -> None:
    locales = MARKET / "src" / "client" / "locales.ts"
    insert_after(
        locales,
        "  terminalWarn: '这看起来是终端/命令行插件：装进网页版可能无效，甚至导致 DeepSeek Harness 无法启动。建议先看它的使用说明，按说明装进对应的 profile。',\n",
        "  githubInstallWarn: '此插件没有 npm 安装包，安装时必须从 github.com 下载源码；中国大陆网络通常无法直连。请仅在当前网络能访问 GitHub 时继续。',\n",
    )
    insert_after(
        locales,
        "  terminalWarn: 'This looks like a terminal/CLI plugin: installing it into the web profile may do nothing, or even break DeepSeek Harness startup. Read its README and install it into the profile it targets.',\n",
        "  githubInstallWarn: 'This plugin has no npm package. Installation must download its source from github.com and will fail where GitHub is unreachable. Continue only if this network can access GitHub.',\n",
    )

    section = MARKET / "src" / "client" / "MarketSection.tsx"
    source_anchor = """          <p className={css.modalNote}><IconWarningOutline16 size={14} className={css.bannerIcon} />{' ' + t('confirmWarn')}</p>\n"""
    source_addition = """          {typeof confirming.npm !== 'string' && (
            <p className={css.warnLine}>
              <IconWarningOutline16 size={14} className={css.bannerIcon} />
              {' ' + t('githubInstallWarn')}
            </p>
          )}\n"""
    insert_before(section, source_anchor, source_addition)

    client = MARKET / "client" / "client.js"
    insert_after(
        client,
        '\t\t\tterminalWarn: "这看起来是终端/命令行插件：装进网页版可能无效，甚至导致 DeepSeek Harness 无法启动。建议先看它的使用说明，按说明装进对应的 profile。",\n',
        '\t\t\tgithubInstallWarn: "此插件没有 npm 安装包，安装时必须从 github.com 下载源码；中国大陆网络通常无法直连。请仅在当前网络能访问 GitHub 时继续。",\n',
    )
    insert_after(
        client,
        '\t\t\tterminalWarn: "This looks like a terminal/CLI plugin: installing it into the web profile may do nothing, or even break DeepSeek Harness startup. Read its README and install it into the profile it targets.",\n',
        '\t\t\tgithubInstallWarn: "This plugin has no npm package. Installation must download its source from github.com and will fail where GitHub is unreachable. Continue only if this network can access GitHub.",\n',
    )



if __name__ == "__main__":
    main()