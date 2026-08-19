use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::paths::{cache_home, copy_tree, data_home, is_flatpak, BundledPaths};
use crate::{ENV_NO_UPDATE, ENV_NPM_REGISTRY};

pub const DSH_PACKAGE: &str = "@deepseek-ai/dsh";
pub const VIEW_TIMEOUT_SECONDS: u64 = 20;
pub const INSTALL_TIMEOUT_SECONDS: u64 = 180;
pub const BUNDLED_PREFIX: &str = "/app";
pub const BUNDLED_DSH: &[&str] = &["/app/bin/dsh", "/app/node24/bin/dsh"];
pub const DEFAULT_NPM_REGISTRY: &str = "https://registry.npmmirror.com";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateResult {
    pub status: &'static str,
    pub version: Option<String>,
    pub previous: Option<String>,
    pub message: String,
}

impl UpdateResult {
    fn new(status: &'static str, version: Option<String>, message: impl Into<String>) -> Self {
        Self {
            status,
            version,
            previous: None,
            message: message.into(),
        }
    }
}

pub fn update_prefix() -> PathBuf {
    data_home().join("dsh-desktop/dsh-prefix")
}

fn dsh_bin(prefix: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        return prefix.join("dsh.cmd");
    }
    #[cfg(not(windows))]
    prefix.join("bin/dsh")
}

pub fn update_dsh_bin() -> PathBuf {
    dsh_bin(&update_prefix())
}

pub fn package_json(prefix: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        return prefix.join("node_modules/@deepseek-ai/dsh/package.json");
    }
    #[cfg(not(windows))]
    prefix.join("lib/node_modules/@deepseek-ai/dsh/package.json")
}

pub fn read_version(prefix: &Path) -> Option<String> {
    let text = std::fs::read_to_string(package_json(prefix)).ok()?;
    let data: serde_json::Value = serde_json::from_str(&text).ok()?;
    data.get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

pub fn bundled_dsh_prefix(paths: &BundledPaths) -> Option<PathBuf> {
    #[cfg(windows)]
    const MARKER: &str = "node_modules/@deepseek-ai/dsh/package.json";
    #[cfg(not(windows))]
    const MARKER: &str = "lib/node_modules/@deepseek-ai/dsh/package.json";
    paths
        .find_dir("dsh-prefix", MARKER)
        .or_else(|| paths.find_dir("vendor/dsh-prefix", MARKER))
}

fn install_bundled_prefix(src: &Path, dest: &Path) -> Result<String, String> {
    let staging = dest.with_extension("staging");
    copy_tree(src, &staging, true).map_err(|error| error.to_string())?;
    let Some(version) =
        read_version(&staging).filter(|_| crate::launcher::is_executable(&dsh_bin(&staging)))
    else {
        let _ = std::fs::remove_dir_all(&staging);
        return Err("内置 dsh 资源不完整".to_string());
    };
    if dest.exists() {
        std::fs::remove_dir_all(dest).map_err(|error| error.to_string())?;
    }
    std::fs::rename(&staging, dest).map_err(|error| error.to_string())?;
    Ok(version)
}

/// Copy the packaged official dsh into the writable update prefix once.
/// Flatpak already exposes its bundled core directly under `/app`.
pub fn provision_bundled_dsh(paths: &BundledPaths) -> Result<Option<String>, String> {
    if is_flatpak() {
        return Ok(read_version(Path::new(BUNDLED_PREFIX)));
    }
    let dest = update_prefix();
    if crate::launcher::is_executable(&dsh_bin(&dest)) {
        if let Some(version) = read_version(&dest) {
            return Ok(Some(version));
        }
    }
    let Some(src) = bundled_dsh_prefix(paths) else {
        return Ok(None);
    };
    install_bundled_prefix(&src, &dest).map(Some)
}

pub fn find_npm() -> Option<PathBuf> {
    for candidate in ["/app/bin/npm", "/app/node24/bin/npm"] {
        let path = PathBuf::from(candidate);
        if crate::launcher::is_executable(&path) {
            return Some(path);
        }
    }
    which::which("npm").ok()
}

fn find_node_dir() -> Option<PathBuf> {
    for candidate in ["/app/bin/node", "/app/node24/bin/node"] {
        let path = PathBuf::from(candidate);
        if crate::launcher::is_executable(&path) {
            return path.parent().map(|p| p.to_path_buf());
        }
    }
    which::which("node")
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

fn selected_npm_registry<'a>(
    desktop_override: Option<&'a OsStr>,
    npm_override: Option<&'a OsStr>,
) -> &'a OsStr {
    desktop_override
        .filter(|value| !value.is_empty())
        .or_else(|| npm_override.filter(|value| !value.is_empty()))
        .unwrap_or_else(|| OsStr::new(DEFAULT_NPM_REGISTRY))
}

pub(crate) fn configure_npm_registry(command: &mut Command) {
    let desktop_override = std::env::var_os(ENV_NPM_REGISTRY);
    let npm_override =
        std::env::var_os("npm_config_registry").or_else(|| std::env::var_os("NPM_CONFIG_REGISTRY"));
    command.env(
        "npm_config_registry",
        selected_npm_registry(desktop_override.as_deref(), npm_override.as_deref()),
    );
}

fn npm_command(npm: &Path) -> Command {
    let mut cmd = Command::new(npm);
    let cache = cache_home().join("dsh-desktop/npm");
    configure_npm_registry(&mut cmd);
    let _ = std::fs::create_dir_all(&cache);
    cmd.env("npm_config_cache", &cache);
    cmd.env("npm_config_update_notifier", "false");
    cmd.env("npm_config_fund", "false");
    cmd.env("npm_config_audit", "false");
    if let Some(node_dir) = find_node_dir() {
        let mut path = node_dir.into_os_string();
        path.push(if cfg!(windows) { ";" } else { ":" });
        if let Some(existing) = std::env::var_os("PATH") {
            path.push(existing);
        }
        cmd.env("PATH", path);
    }
    cmd
}

fn run_npm(npm: &Path, args: &[&str], timeout: Duration) -> Result<std::process::Output, String> {
    let mut cmd = npm_command(npm);
    cmd.args(args);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    let child = cmd.spawn().map_err(|e| e.to_string())?;
    let pid = child.id();
    let done = Arc::new(AtomicBool::new(false));
    let flag = Arc::clone(&done);
    thread::spawn(move || {
        let start = Instant::now();
        while start.elapsed() < timeout {
            if flag.load(Ordering::Relaxed) {
                return;
            }
            thread::sleep(Duration::from_millis(50));
        }
        if flag.load(Ordering::Relaxed) {
            return;
        }
        #[cfg(unix)]
        unsafe {
            libc::kill(pid as i32, libc::SIGKILL);
        }
        #[cfg(windows)]
        {
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/F"])
                .status();
        }
    });
    let out = child.wait_with_output().map_err(|e| e.to_string());
    done.store(true, Ordering::Relaxed);
    out
}

fn last_check_path() -> PathBuf {
    cache_home().join("dsh-desktop/last-update-check")
}

/// True when a network update check has not run in the last 24 hours.
pub fn update_check_due() -> bool {
    let path = last_check_path();
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return true;
    };
    let ts: u64 = raw.trim().parse().unwrap_or(0);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    now.saturating_sub(ts) >= 24 * 60 * 60
}

pub fn mark_update_checked() {
    let path = last_check_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let _ = std::fs::write(path, format!("{now}\n"));
}

pub fn fetch_latest_version(npm: &Path) -> Option<String> {
    let out = run_npm(
        npm,
        &["view", DSH_PACKAGE, "version"],
        Duration::from_secs(VIEW_TIMEOUT_SECONDS),
    )
    .ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .last()
        .map(|s| s.to_string())
}

fn seed_from_bundle(dest: &Path) {
    let src_pkg = Path::new(BUNDLED_PREFIX).join("lib/node_modules/@deepseek-ai/dsh");
    if !src_pkg.is_dir() {
        return;
    }
    let dest_pkg = dest.join("lib/node_modules/@deepseek-ai/dsh");
    if dest_pkg.exists() {
        return;
    }
    if crate::paths::copy_tree(&src_pkg, &dest_pkg, true).is_err() {
        return;
    }
    let dest_bin = dest.join("bin");
    let _ = std::fs::create_dir_all(&dest_bin);
    let link = dest_bin.join("dsh");
    if !link.exists() {
        let _ = crate::paths::replace_symlink(
            &link,
            Path::new("../lib/node_modules/@deepseek-ai/dsh/lib/bin.js"),
        );
    }
}

fn env_skips_update() -> bool {
    std::env::var(ENV_NO_UPDATE)
        .map(|v| matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false)
}

pub fn update_dsh(enabled: bool) -> UpdateResult {
    if !enabled || env_skips_update() {
        let version =
            read_version(&update_prefix()).or_else(|| read_version(Path::new(BUNDLED_PREFIX)));
        return UpdateResult::new("skipped", version, "已跳过 dsh 更新");
    }

    let npm = find_npm();
    let current =
        read_version(&update_prefix()).or_else(|| read_version(Path::new(BUNDLED_PREFIX)));
    let Some(npm) = npm else {
        let extra = current
            .as_deref()
            .map(|v| format!("（{v}）"))
            .unwrap_or_default();
        return UpdateResult::new(
            "skipped",
            current,
            format!("未找到 npm，使用已安装的 dsh{extra}"),
        );
    };

    let latest = match fetch_latest_version(&npm) {
        Some(v) => v,
        None => {
            let extra = current
                .as_deref()
                .map(|v| format!("（{v}）"))
                .unwrap_or_default();
            return UpdateResult::new(
                "failed",
                current,
                format!("无法获取 dsh 最新版本，使用已安装版本{extra}"),
            );
        }
    };

    if current.as_deref() == Some(latest.as_str()) {
        return UpdateResult::new("current", current, format!("内置 dsh 已是最新（{latest}）"));
    }

    let dest = update_prefix();
    let _ = std::fs::create_dir_all(&dest);
    if read_version(&dest).is_none() {
        seed_from_bundle(&dest);
    }

    let prefix_arg = format!("--prefix={}", dest.display());
    let pkg = format!("{DSH_PACKAGE}@latest");
    let previous = current.clone();
    match run_npm(
        &npm,
        &[
            "install",
            &prefix_arg,
            "--global",
            "--no-audit",
            "--no-fund",
            &pkg,
        ],
        Duration::from_secs(INSTALL_TIMEOUT_SECONDS),
    ) {
        Ok(out) if out.status.success() => {
            let installed = read_version(&dest).or(current);
            UpdateResult {
                status: "updated",
                version: installed.clone(),
                previous,
                message: format!(
                    "已将内置 dsh 更新到 {}",
                    installed.as_deref().unwrap_or("latest")
                ),
            }
        }
        Ok(_) | Err(_) => {
            let installed = read_version(&dest).or(current);
            let extra = installed
                .as_deref()
                .map(|v| format!("（{v}）"))
                .unwrap_or_default();
            UpdateResult {
                status: "failed",
                version: installed,
                previous,
                message: format!("dsh 更新失败，使用已安装版本{extra}"),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn read_version_ok() {
        let tmp = TempDir::new().unwrap();
        let pkg = package_json(tmp.path());
        std::fs::create_dir_all(pkg.parent().unwrap()).unwrap();
        std::fs::write(&pkg, r#"{"version":"0.1.0-rc.6"}"#).unwrap();
        assert_eq!(read_version(tmp.path()).as_deref(), Some("0.1.0-rc.6"));
    }

    #[test]
    fn read_version_missing() {
        assert_eq!(read_version(Path::new("/no/such/prefix")), None);
    }
    #[test]
    fn npm_commands_default_to_mainland_reachable_registry() {
        assert_eq!(
            selected_npm_registry(None, None),
            OsStr::new(DEFAULT_NPM_REGISTRY)
        );
    }

    #[test]
    fn desktop_registry_override_wins() {
        assert_eq!(
            selected_npm_registry(
                Some(OsStr::new("https://registry.example.cn")),
                Some(OsStr::new("https://registry.npmjs.org")),
            ),
            OsStr::new("https://registry.example.cn")
        );
    }

    #[test]
    fn npm_registry_override_is_preserved() {
        assert_eq!(
            selected_npm_registry(None, Some(OsStr::new("https://packages.example.com/npm")),),
            OsStr::new("https://packages.example.com/npm")
        );
    }

    #[test]
    fn bundled_prefix_is_copied_as_a_usable_core() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("src");
        let dest = tmp.path().join("dest");
        let package = package_json(&src);
        std::fs::create_dir_all(package.parent().unwrap()).unwrap();
        std::fs::write(&package, r#"{"version":"0.1.0-rc.7"}"#).unwrap();
        let bin = dsh_bin(&src);
        std::fs::create_dir_all(bin.parent().unwrap()).unwrap();
        std::fs::write(&bin, "#!/usr/bin/env node\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
        }

        assert_eq!(install_bundled_prefix(&src, &dest).unwrap(), "0.1.0-rc.7");
        assert_eq!(read_version(&dest).as_deref(), Some("0.1.0-rc.7"));
        assert!(crate::launcher::is_executable(&dsh_bin(&dest)));
    }

    #[test]
    fn skip_when_disabled() {
        let result = update_dsh(false);
        assert_eq!(result.status, "skipped");
    }

    #[test]
    fn skip_when_env_set() {
        std::env::set_var(ENV_NO_UPDATE, "1");
        let result = update_dsh(true);
        std::env::remove_var(ENV_NO_UPDATE);
        assert_eq!(result.status, "skipped");
    }

    #[test]
    fn update_check_due_without_stamp() {
        let tmp = TempDir::new().unwrap();
        std::env::set_var("XDG_CACHE_HOME", tmp.path());
        assert!(update_check_due());
        mark_update_checked();
        assert!(!update_check_due());
        std::env::remove_var("XDG_CACHE_HOME");
    }
}
