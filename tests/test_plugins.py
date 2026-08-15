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
        self.assertTrue((ROOT / "docs" / "licenses" / "modlens.LICENSE").is_file())
        self.assertTrue(
            (ROOT / "docs" / "licenses" / "dsh-anchored-standard.NOTICE").is_file()
        )
        for name in ("splash.png", "session.png", "vision.png", "menu.png"):
            self.assertTrue((ROOT / "docs" / "screenshots" / name).is_file())


if __name__ == "__main__":
    unittest.main()
