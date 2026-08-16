import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "build-gitea-update.py"


class GiteaUpdateManifestTests(unittest.TestCase):
    def test_normalizes_matrix_artifacts_and_embeds_signatures(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifacts = root / "artifacts"
            output = root / "staged"
            fixtures = {
                "gitea-macos-arm64": ".app.tar.gz",
                "gitea-macos-x64": ".app.tar.gz",
                "gitea-linux": ".AppImage",
                "gitea-windows": ".exe",
            }
            for matrix, suffix in fixtures.items():
                bundle = artifacts / matrix / "target" / "release" / "bundle"
                bundle.mkdir(parents=True)
                artifact = bundle / f"DeepSeek Harness{suffix}"
                artifact.write_bytes(matrix.encode())
                artifact.with_name(artifact.name + ".sig").write_text(
                    f"signature-{matrix}\n", encoding="utf-8"
                )

            subprocess.run(
                [
                    "python3",
                    str(SCRIPT),
                    "--artifacts",
                    str(artifacts),
                    "--output",
                    str(output),
                    "--version",
                    "1.2.3",
                    "--package-base-url",
                    "http://gitea.example/api/packages/u/generic/app",
                    "--pub-date",
                    "2026-08-16T00:00:00Z",
                ],
                check=True,
            )

            manifest = json.loads((output / "latest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["version"], "1.2.3")
            self.assertEqual(
                set(manifest["platforms"]),
                {
                    "darwin-aarch64-app",
                    "darwin-aarch64",
                    "darwin-x86_64-app",
                    "darwin-x86_64",
                    "linux-x86_64-appimage",
                    "linux-x86_64",
                    "windows-x86_64-nsis",
                    "windows-x86_64",
                },
            )
            windows = manifest["platforms"]["windows-x86_64"]
            self.assertEqual(windows["signature"], "signature-gitea-windows")
            self.assertTrue(windows["url"].endswith("/1.2.3/dsh-easy-desktop_1.2.3_windows_x86_64.exe"))


if __name__ == "__main__":
    unittest.main()
