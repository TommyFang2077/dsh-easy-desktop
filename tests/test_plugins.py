"""Sanity checks for the bundled dsh WebUI plugin (no desktop runtime)."""

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class VisionSettingsDocsTests(unittest.TestCase):
    """The vision engine has exactly one documented settings surface: the
    modlens card under 设置 → 插件 → 插件配置 (regression guard for the
    removed duplicate dsh-desktop-vision section)."""

    def test_readme_points_at_the_modlens_config_card(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("设置 → 插件 → 插件配置", readme)
        self.assertIn("视觉引擎（ModLens）", readme)
        self.assertNotIn("设置 → 视觉模型", readme)


class VoicePluginFilesTests(unittest.TestCase):
    def test_client_registers_composer_and_settings(self):
        client = (ROOT / "plugins" / "dsh-desktop-voice" / "client.js").read_text(
            encoding="utf-8"
        )
        host = (ROOT / "plugins" / "dsh-desktop-voice" / "index.js").read_text(
            encoding="utf-8"
        )
        pkg = (ROOT / "plugins" / "dsh-desktop-voice" / "package.json").read_text(
            encoding="utf-8"
        )
        self.assertIn("settings.section", client)
        self.assertIn("conversation.input.right", client)
        self.assertIn("dsh-desktop-voice", client)
        self.assertIn("Ctrl+E", client)
        self.assertIn("dictationMode", client)
        self.assertIn("whisper-1", host)
        self.assertIn("/dsh-desktop/voice", host)
        self.assertIn("/dsh-desktop/voice/transcribe", host)
        self.assertIn("/dsh-desktop/voice/model", host)
        self.assertIn("SenseVoice", client)
        self.assertIn("sherpa-onnx@", host)
        self.assertNotIn("SpeechRecognition", client)
        self.assertNotIn("engine === 'browser'", client)
        self.assertIn("engine === 'openai'", client)
        self.assertIn("cfg.engine === 'openai'", host)
        self.assertFalse(
            (ROOT / "plugins" / "dsh-desktop-voice" / "model.int8.onnx").exists()
        )
        self.assertIn("https://api.openai.com/v1", host)
        self.assertIn("@deepseek-ai/dsh-client-ui-conversation", pkg)
        self.assertIn("@deepseek-ai/dsh-client-ui-settings", pkg)


class ClipboardIngestTests(unittest.TestCase):
    def test_inject_delivers_images_as_paste_not_only_drop(self):
        ingest = (ROOT / "ui" / "inject" / "ingest.js").read_text(encoding="utf-8")
        chrome = (ROOT / "ui" / "inject" / "chrome.js").read_text(encoding="utf-8")
        self.assertIn("window.__dshDesktopIngestFiles", ingest)
        self.assertIn("/modlens/paste", ingest)
        self.assertIn("ClipboardEvent", ingest)
        self.assertIn("navigator.clipboard.read", chrome)
        self.assertIn("read_clipboard_images", chrome)
        self.assertIn("__dshDesktopIngesting", chrome)
        self.assertIn('clipboardText(e, "text/html")', chrome)
        self.assertNotIn(
            'item.kind === "file" && item.getAsFile()',
            chrome,
        )
        self.assertNotIn("steal", chrome)
        self.assertNotIn("|| !String(text).trim()", chrome)

    def test_inject_restarts_tauri_owned_dsh_process(self):
        chrome = (ROOT / "ui" / "inject" / "chrome.js").read_text(encoding="utf-8")
        self.assertIn('requestUrl.origin === location.origin', chrome)
        self.assertIn('requestUrl.pathname === "/dsh-market/restart"', chrome)
        self.assertIn('t.core.invoke("restart")', chrome)
        self.assertIn('t.event.listen("ready"', chrome)
        self.assertLess(chrome.index('t.event.listen("ready"'), chrome.index("window.fetch = function"))
        self.assertIn("window.location.replace(url)", chrome)


class BundledAttributionTests(unittest.TestCase):
    def test_readme_cites_upstream_plugins(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        third = (ROOT / "THIRD_PARTY.md").read_text(encoding="utf-8")
        for text in (readme, third):
            self.assertIn("https://github.com/deepseek-ai/deepseek-harness", text)
            self.assertIn("https://github.com/liustack/modlens", text)
            self.assertIn("https://github.com/xiaobright/dsh-anchored-standard", text)
            self.assertIn("0.1.0-rc.7", text)
            self.assertIn("3.16.6", text)
            self.assertIn("ffb845c5480adc953392a6db6f8a98ede621174b", text)
            self.assertIn("dsh-desktop-voice", text)
            self.assertIn("https://github.com/dsh-market/dsh-market", text)
            self.assertIn("1.11.3", text)
        self.assertIn("dsh-plugin", readme)
        self.assertIn("带上眼睛", readme)
        self.assertIn("+8%", readme)
        self.assertTrue((ROOT / "docs" / "licenses" / "modlens.LICENSE").is_file())
        self.assertTrue(
            (ROOT / "docs" / "licenses" / "dsh-anchored-standard.NOTICE").is_file()
        )
        self.assertTrue((ROOT / "docs" / "licenses" / "dshmarket.LICENSE").is_file())
        for name in ("splash.png", "session.png", "vision.png", "menu.png"):
            self.assertTrue((ROOT / "docs" / "screenshots" / name).is_file())


if __name__ == "__main__":
    unittest.main()
