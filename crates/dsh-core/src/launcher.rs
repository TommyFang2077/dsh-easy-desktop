use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

use regex::Regex;
use thiserror::Error;

use crate::paths::{home_dir, is_flatpak};
use crate::updater::{configure_npm_registry, update_dsh_bin};
use crate::{ENV_BIN_OVERRIDE, ENV_CWD_OVERRIDE};

pub const DSH_DEFAULT_HOST: &str = "127.0.0.1";
pub const URL_TIMEOUT_SECONDS: u64 = 120;

#[derive(Debug, Error)]
pub enum DshNotFound {
    #[error("{0}")]
    Message(String),
}

impl DshNotFound {
    fn new(msg: impl Into<String>) -> Self {
        Self::Message(msg.into())
    }

    /// True when resolution successfully analyzed every candidate and found no
    /// usable dsh at all (as opposed to an invalid user-supplied override).
    pub fn is_missing(&self) -> bool {
        matches!(
            self,
            DshNotFound::Message(message) if message.contains("找不到")
        )
    }
}

pub fn strip_ansi(text: &str) -> String {
    let re = Regex::new(r"\x1b\[[0-9;?]*[ -/]*[@-~]").expect("ansi regex");
    re.replace_all(text, "").into_owned()
}

pub fn parse_dsh_url(line: &str) -> Option<String> {
    let re = Regex::new(r"https?://(?:\[[0-9a-fA-F:]+\]|[^/\s:]+)(?::\d+)?(?:/[^\s]*)?")
        .expect("url regex");
    re.find(&strip_ansi(line)).map(|m| m.as_str().to_string())
}

pub fn default_workspace() -> PathBuf {
    if let Ok(raw) = std::env::var(ENV_CWD_OVERRIDE) {
        if !raw.is_empty() {
            return PathBuf::from(&raw)
                .canonicalize()
                .unwrap_or_else(|_| PathBuf::from(raw));
        }
    }
    if is_flatpak() {
        return home_dir();
    }
    std::env::current_dir().unwrap_or_else(|_| home_dir())
}

pub fn find_npx_dsh_bins() -> Vec<PathBuf> {
    let pattern = home_dir().join(".npm/_npx/*/node_modules/.bin/dsh");
    let mut bins = Vec::new();
    if let Some(globbed) = pattern.to_str() {
        if let Ok(paths) = glob_simple(globbed) {
            for path in paths {
                // npm also drops an extensionless POSIX shim (`dsh`) next to
                // `dsh.cmd`; Windows cannot CreateProcess that file, so prefer
                // the cmd wrapper when present.
                #[cfg(windows)]
                let path = {
                    let cmd = path.with_extension("cmd");
                    if cmd.is_file() {
                        cmd
                    } else {
                        path
                    }
                };
                if is_executable(&path) {
                    bins.push(path);
                }
            }
        }
    }
    bins.sort_by_key(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok());
    bins.reverse();
    bins
}

fn glob_simple(pattern: &str) -> std::io::Result<Vec<PathBuf>> {
    // Only the `_npx/*/` segment is a wildcard.
    let Some((prefix, rest)) = pattern.split_once('*') else {
        return Ok(vec![PathBuf::from(pattern)]);
    };
    let suffix = rest.trim_start_matches('/');
    let parent = Path::new(prefix);
    let mut out = Vec::new();
    if parent.is_dir() {
        for entry in std::fs::read_dir(parent)? {
            let entry = entry?;
            let candidate = entry.path().join(suffix);
            if candidate.is_file() {
                out.push(candidate);
            }
        }
    }
    Ok(out)
}

pub struct DshLauncher {
    dsh_bin_override: Option<String>,
    in_flatpak: bool,
    pub workspace: PathBuf,
}

impl DshLauncher {
    pub fn new(dsh_bin: Option<String>, workspace: Option<PathBuf>) -> Self {
        Self {
            dsh_bin_override: dsh_bin,
            in_flatpak: is_flatpak(),
            workspace: workspace.unwrap_or_else(default_workspace),
        }
    }

    fn collect_candidates(&self) -> Result<Vec<Vec<String>>, DshNotFound> {
        let mut candidates: Vec<Vec<String>> = Vec::new();

        if let Ok(env_override) = std::env::var(ENV_BIN_OVERRIDE) {
            if !env_override.is_empty() {
                let parts = shlex::split(&env_override).ok_or_else(|| {
                    DshNotFound::new(format!("{ENV_BIN_OVERRIDE} 不是合法的命令"))
                })?;
                candidates.push(parts);
            }
        }
        if let Some(cli) = &self.dsh_bin_override {
            let parts =
                shlex::split(cli).ok_or_else(|| DshNotFound::new("dsh 命令不是合法的命令"))?;
            candidates.push(parts);
        }

        let updated = update_dsh_bin();
        if is_executable(&updated) {
            candidates.push(vec![updated.to_string_lossy().into_owned()]);
        }

        if self.in_flatpak {
            if let Some(bundled) = which::which("dsh").ok() {
                candidates.push(vec![bundled.to_string_lossy().into_owned()]);
            }
            for path in crate::updater::BUNDLED_DSH {
                let path = PathBuf::from(path);
                if is_executable(&path)
                    && candidates
                        .first()
                        .and_then(|c| c.first())
                        .map(|s| s.as_str())
                        != Some(path.to_string_lossy().as_ref())
                {
                    candidates.push(vec![path.to_string_lossy().into_owned()]);
                }
            }
        } else {
            let local_bin = dsh_bin_name(&home_dir().join(".local/bin"));
            if is_executable(&local_bin) {
                candidates.push(vec![local_bin.to_string_lossy().into_owned()]);
            }
            if let Some(cached) = find_npx_dsh_bins().into_iter().next() {
                candidates.push(vec![cached.to_string_lossy().into_owned()]);
            }
            if let Ok(host) = which::which("dsh") {
                candidates.push(vec![host.to_string_lossy().into_owned()]);
            }
            if which::which("npx").is_ok() {
                candidates.push(vec![
                    "npx".into(),
                    "--yes".into(),
                    "@deepseek-ai/dsh".into(),
                ]);
            }
        }

        Ok(candidates)
    }

    pub fn resolve(&self) -> Result<Vec<String>, DshNotFound> {
        let candidates = self.collect_candidates()?;
        let chosen = candidates.into_iter().next().ok_or_else(|| {
            if self.in_flatpak {
                DshNotFound::new(
                    "此 Flatpak 没有内置 dsh 可执行文件。\n请重新构建/安装 io.github.tommyfang.DshDesktop。",
                )
            } else {
                DshNotFound::new(
                    "找不到 DeepSeek Harness (dsh)。\n请安装 Node.js/npm（首次启动会自动安装 dsh），或用 DSH_DESKTOP_DSH_BIN 指定 dsh 的完整路径。",
                )
            }
        })?;
        Ok(chosen)
    }

    /// True when a real dsh binary is available without relying on the
    /// transient `npx --yes @deepseek-ai/dsh` fallback.
    pub fn has_installed_dsh(&self) -> Result<bool, DshNotFound> {
        let candidates = self.collect_candidates()?;
        Ok(candidates
            .iter()
            .any(|candidate| candidate.first().map(String::as_str) != Some("npx")))
    }

    pub fn web_argv(&self) -> Result<Vec<String>, DshNotFound> {
        let mut argv = self.resolve()?;
        argv.extend([
            "web".into(),
            "--host".into(),
            DSH_DEFAULT_HOST.into(),
            "--port".into(),
            "0".into(),
        ]);
        Ok(argv)
    }

    pub fn start(&self) -> Result<DshProcess, DshNotFound> {
        let argv = self.web_argv()?;
        let mut cmd = Command::new(&argv[0]);
        cmd.args(&argv[1..])
            .current_dir(&self.workspace)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());
        configure_npm_registry(&mut cmd);
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
            cmd.creation_flags(CREATE_NEW_PROCESS_GROUP);
        }
        let mut child = cmd
            .spawn()
            .map_err(|exc| DshNotFound::new(format!("无法启动 dsh web: {exc}")))?;
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        Ok(DshProcess::new(child, stdout, stderr, self.in_flatpak))
    }
}

fn dsh_bin_name(dir: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let cmd = dir.join("dsh.cmd");
        if cmd.is_file() {
            return cmd;
        }
    }
    dir.join("dsh")
}

pub fn is_executable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(path)
            .map(|m| m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(windows)]
    {
        true
    }
}

fn capture_output<R: Read + Send + 'static>(
    stream: R,
    lines: Arc<Mutex<VecDeque<String>>>,
    url: Arc<Mutex<Option<String>>>,
    detect_url: bool,
) {
    thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let clean = strip_ansi(&line);
            let trimmed = clean.trim_end();
            if !trimmed.is_empty() {
                if let Ok(mut buf) = lines.lock() {
                    if buf.len() == 400 {
                        buf.pop_front();
                    }
                    buf.push_back(trimmed.to_string());
                }
            }
            if detect_url {
                if let Some(found) = parse_dsh_url(&line) {
                    if let Ok(mut slot) = url.lock() {
                        if slot.is_none() {
                            *slot = Some(found);
                        }
                    }
                }
            }
        }
    });
}

pub struct DshProcess {
    child: Arc<Mutex<Child>>,
    pub in_flatpak: bool,
    pub url: Arc<Mutex<Option<String>>>,
    pub lines: Arc<Mutex<VecDeque<String>>>,
    pub started_at: Instant,
}

impl DshProcess {
    fn new(
        child: Child,
        stdout: Option<std::process::ChildStdout>,
        stderr: Option<std::process::ChildStderr>,
        in_flatpak: bool,
    ) -> Self {
        let proc = Self {
            child: Arc::new(Mutex::new(child)),
            in_flatpak,
            url: Arc::new(Mutex::new(None)),
            lines: Arc::new(Mutex::new(VecDeque::with_capacity(400))),
            started_at: Instant::now(),
        };
        if let Some(stdout) = stdout {
            capture_output(stdout, Arc::clone(&proc.lines), Arc::clone(&proc.url), true);
        }
        if let Some(stderr) = stderr {
            capture_output(
                stderr,
                Arc::clone(&proc.lines),
                Arc::clone(&proc.url),
                false,
            );
        }
        proc
    }

    pub fn poll(&self) -> Option<i32> {
        self.child
            .lock()
            .ok()
            .and_then(|mut child| child.try_wait().ok().flatten().and_then(|s| s.code()))
    }

    pub fn take_url(&self) -> Option<String> {
        self.url.lock().ok().and_then(|g| g.clone())
    }

    pub fn snapshot_lines(&self) -> Vec<String> {
        self.lines
            .lock()
            .map(|g| g.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub fn stop(&self) {
        let Ok(mut child) = self.child.lock() else {
            return;
        };
        if child.try_wait().ok().flatten().is_some() {
            return;
        }
        #[cfg(unix)]
        let pid = child.id();
        #[cfg(unix)]
        unsafe {
            libc::killpg(pid as i32, libc::SIGTERM);
        }
        #[cfg(windows)]
        {
            let _ = child.kill();
        }
        let start = Instant::now();
        while start.elapsed() < std::time::Duration::from_secs(3) {
            if child.try_wait().ok().flatten().is_some() {
                return;
            }
            thread::sleep(std::time::Duration::from_millis(50));
        }
        #[cfg(unix)]
        unsafe {
            libc::killpg(pid as i32, libc::SIGKILL);
        }
        let _ = child.kill();
        let _ = child.wait();
    }
}

impl Drop for DshProcess {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn parse_ipv4_url() {
        assert_eq!(
            parse_dsh_url("dsh web: http://127.0.0.1:39095"),
            Some("http://127.0.0.1:39095".into())
        );
    }

    #[test]
    fn parse_ipv6_url() {
        assert_eq!(
            parse_dsh_url("dsh web: http://[::1]:39096"),
            Some("http://[::1]:39096".into())
        );
    }

    #[test]
    fn parse_url_with_trailing_text() {
        assert_eq!(
            parse_dsh_url("booted profile web on http://127.0.0.1:39095 (ready)"),
            Some("http://127.0.0.1:39095".into())
        );
    }

    #[test]
    fn parse_no_url() {
        assert_eq!(parse_dsh_url("waiting for network…"), None);
    }

    #[test]
    fn strip_ansi_codes() {
        assert_eq!(strip_ansi("\x1b[36mhttp://x\x1b[0m"), "http://x");
    }

    #[test]
    fn workspace_uses_env_override() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var(ENV_CWD_OVERRIDE, "/tmp/some-workspace");
        let ws = default_workspace();
        std::env::remove_var(ENV_CWD_OVERRIDE);
        assert!(ws.ends_with("some-workspace") || ws == PathBuf::from("/tmp/some-workspace"));
    }

    #[test]
    fn env_override_wins() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var(ENV_BIN_OVERRIDE, "echo");
        let argv = DshLauncher::new(None, None).resolve().unwrap();
        std::env::remove_var(ENV_BIN_OVERRIDE);
        assert_eq!(argv, vec!["echo"]);
    }

    #[test]
    fn has_installed_dsh_with_override() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var(ENV_BIN_OVERRIDE, "echo");
        let launcher = DshLauncher::new(None, None);
        assert!(launcher.has_installed_dsh().unwrap());
        std::env::remove_var(ENV_BIN_OVERRIDE);
    }

    #[test]
    fn invalid_env_override_raises() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var(ENV_BIN_OVERRIDE, "'unterminated");
        let err = DshLauncher::new(None, None).resolve();
        std::env::remove_var(ENV_BIN_OVERRIDE);
        assert!(err.is_err());
    }

    #[test]
    fn cli_override() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::remove_var(ENV_BIN_OVERRIDE);
        let argv = DshLauncher::new(Some("/opt/dsh/bin/dsh".into()), None)
            .resolve()
            .unwrap();
        assert_eq!(argv, vec!["/opt/dsh/bin/dsh"]);
    }

    #[test]
    fn web_argv_shape() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var(ENV_BIN_OVERRIDE, "dsh-test");
        let argv = DshLauncher::new(None, None).web_argv().unwrap();
        std::env::remove_var(ENV_BIN_OVERRIDE);
        assert_eq!(&argv[0..4], ["dsh-test", "web", "--host", "127.0.0.1"]);
        assert!(argv.contains(&"--port".into()));
        assert_eq!(argv.last().map(String::as_str), Some("0"));
    }
}
