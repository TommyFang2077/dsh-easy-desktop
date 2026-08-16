"""Sanity checks for the bundled dsh WebUI plugin (no desktop runtime)."""

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class VisionPluginFilesTests(unittest.TestCase):
    def test_client_registers_system_settings_slots(self):
        client = (ROOT / "plugins" / "dsh-desktop-vision" / "client.js").read_text(
            encoding="utf-8"
        )
        self.assertIn("settings.section", client)
        self.assertNotIn("settings.plugins.tab", client)
        self.assertIn("modlens-vision", client)
        client = (ROOT / "plugins" / "dsh-desktop-vision" / "client.js").read_text(
            encoding="utf-8"
        )
        self.assertIn("settings.section", client)
        self.assertNotIn("settings.plugins.tab", client)
        self.assertIn("modlens-vision", client)
        host = (ROOT / "plugins" / "dsh-desktop-vision" / "index.js").read_text(
            encoding="utf-8"
        )
        self.assertIn("/dsh-desktop/modlens", host)
        self.assertIn("'OpenAI 兼容'", host)
        self.assertNotIn("Qwen / 自建网关", host)
        self.assertIn("https://api.openai.com/v1", host)
        self.assertIn("https://generativelanguage.googleapis.com", host)
        self.assertIn("https://api.anthropic.com", host)
        self.assertIn("https://platform.openai.com/api-keys", host)
        self.assertIn("https://aistudio.google.com/apikey", host)
        self.assertIn("https://console.anthropic.com/settings/keys", host)
        self.assertIn("获取 API", client)
        self.assertNotIn("qwen-agent", client)
        self.assertIn("example: 'gpt-4o'", host)
        self.assertIn("example: 'gemini-3.6-flash'", host)
        self.assertIn("example: 'claude-haiku-4-5-20251001'", host)
        self.assertIn("example: 'gemini-3.6-flash-low'", host)
        self.assertIn("example: 'haiku'", host)


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


class BundledAttributionTests(unittest.TestCase):
    def test_readme_cites_upstream_plugins(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        third = (ROOT / "THIRD_PARTY.md").read_text(encoding="utf-8")
        for text in (readme, third):
            self.assertIn("https://github.com/deepseek-ai/deepseek-harness", text)
            self.assertIn("https://github.com/liustack/modlens", text)
            self.assertIn("https://github.com/xiaobright/dsh-anchored-standard", text)
            self.assertIn("0.1.0-rc.6", text)
            self.assertIn("3.16.6", text)
            self.assertIn("ffb845c5480adc953392a6db6f8a98ede621174b", text)
            self.assertIn("dsh-desktop-vision", text)
            self.assertIn("dsh-desktop-voice", text)
            self.assertIn("https://github.com/dsh-market/dsh-market", text)
            self.assertIn("1.9.0", text)
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
