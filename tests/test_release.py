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


    def test_normalizes_flat_github_assets(self):
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                artifacts = root / "artifacts"
                output = root / "staged"
                artifacts.mkdir()
                fixtures = {
                    "DeepSeek.Harness_0.1.1_aarch64.app.tar.gz": "darwin-aarch64",
                    "DeepSeek.Harness_0.1.1_aarch64.app.tar.gz.sig": "darwin-aarch64",
                    "DeepSeek.Harness_0.1.1_aarch64.dmg": "darwin-aarch64",
                    "DeepSeek.Harness_0.1.1_x64.app.tar.gz": "darwin-x86_64",
                    "DeepSeek.Harness_0.1.1_x64.app.tar.gz.sig": "darwin-x86_64",
                    "DeepSeek.Harness_0.1.1_x64.dmg": "darwin-x86_64",
                    "DeepSeek.Harness_0.1.1_amd64.deb": "linux-x86_64",
                    "DeepSeek.Harness_0.1.1_amd64.AppImage": "linux-x86_64",
                    "DeepSeek.Harness_0.1.1_amd64.AppImage.sig": "linux-x86_64",
                    "DeepSeek.Harness-0.1.1-1.x86_64.rpm": "linux-x86_64",
                    "DeepSeek.Harness_0.1.1_x64-setup.exe": "windows-x86_64",
                    "DeepSeek.Harness_0.1.1_x64-setup.exe.sig": "windows-x86_64",
                    "DeepSeek.Harness_0.1.1_x64_en-US.msi": "windows-x86_64",
                    "io.github.tommyfang.DshDesktop.flatpak": "linux-x86_64",
                }
                for name, marker in fixtures.items():
                    (artifacts / name).write_bytes(marker.encode())

                subprocess.run(
                    [
                        "python3",
                        str(SCRIPT),
                        "--flat-artifacts",
                        str(artifacts),
                        "--output",
                        str(output),
                        "--version",
                        "1.2.3",
                        "--package-base-url",
                        "http://gitea.example/api/packages/u/generic/app",
                    ],
                    check=True,
                )
                manifest = json.loads((output / "latest.json").read_text(encoding="utf-8"))
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
                # Each updater target embeds its own .sig content; fixed-name
                # assets (dmg/rpm/deb/flatpak) are deliverables only.
                self.assertEqual(
                    manifest["platforms"]["linux-x86_64"]["signature"],
                    "linux-x86_64",
                )
                self.assertNotIn("linux-x86_64-app", manifest["platforms"])


if __name__ == "__main__":
    unittest.main()
