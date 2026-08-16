use std::env;
use std::path::{Path, PathBuf};

/// XDG-style data directory (`~/.local/share` on Linux).
pub fn data_home() -> PathBuf {
    if let Some(raw) = env::var_os("XDG_DATA_HOME") {
        if !raw.is_empty() {
            return PathBuf::from(raw);
        }
    }
    dirs::data_dir().unwrap_or_else(|| home_dir().join(".local/share"))
}

/// XDG-style cache directory (`~/.cache` on Linux).
pub fn cache_home() -> PathBuf {
    if let Some(raw) = env::var_os("XDG_CACHE_HOME") {
        if !raw.is_empty() {
            return PathBuf::from(raw);
        }
    }
    dirs::cache_dir().unwrap_or_else(|| home_dir().join(".cache"))
}

pub fn home_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
}

pub fn dsh_home() -> PathBuf {
    if let Some(raw) = env::var_os("DSH_HOME") {
        if !raw.is_empty() {
            return PathBuf::from(raw);
        }
    }
    home_dir().join(".dsh")
}

pub fn downloads_dir() -> PathBuf {
    dirs::download_dir().unwrap_or_else(|| home_dir().join("Downloads"))
}

pub fn is_flatpak() -> bool {
    Path::new("/.flatpak-info").exists()
}

/// Roots that may contain bundled ModLens / presets / vision / AgentRQ plugins.
///
/// Search order: extra roots (Tauri resource dir), `$XDG_DATA_HOME/dsh-desktop`,
/// `/app/share/dsh-desktop`, `/usr/share/dsh-desktop`, `~/.local/share/dsh-desktop`,
/// then the source-tree `vendor/` / `plugins/` next to the executable or crate.
#[derive(Debug, Clone, Default)]
pub struct BundledPaths {
    extra_roots: Vec<PathBuf>,
}

impl BundledPaths {
    pub fn discover() -> Self {
        Self::default()
    }

    pub fn with_resource_dir(mut self, dir: PathBuf) -> Self {
        if dir.is_dir() {
            self.extra_roots.insert(0, dir);
        }
        self
    }

    pub fn roots(&self) -> Vec<PathBuf> {
        let mut roots = self.extra_roots.clone();
        if let Some(xdg) = env::var_os("XDG_DATA_HOME") {
            roots.push(PathBuf::from(xdg).join("dsh-desktop"));
        }
        roots.push(PathBuf::from("/app/share/dsh-desktop"));
        roots.push(PathBuf::from("/usr/share/dsh-desktop"));
        roots.push(home_dir().join(".local/share/dsh-desktop"));
        for repo in repo_roots() {
            roots.push(repo);
        }
        roots
    }

    pub fn find_dir(&self, rel: &str, marker: &str) -> Option<PathBuf> {
        for root in self.roots() {
            let candidate = root.join(rel);
            if candidate.join(marker).is_file() || candidate.join(marker).is_dir() {
                return Some(candidate);
            }
        }
        None
    }
}

fn repo_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            roots.push(parent.to_path_buf());
            if let Some(grand) = parent.parent() {
                roots.push(grand.to_path_buf());
            }
        }
    }
    // crates/dsh-core -> repo root; src-tauri -> repo root
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(parent) = manifest.parent() {
        roots.push(parent.to_path_buf());
        if let Some(grand) = parent.parent() {
            roots.push(grand.to_path_buf());
        }
    }
    roots
}

pub fn copy_tree(src: &Path, dest: &Path, keep_symlinks: bool) -> std::io::Result<()> {
    if dest.exists() {
        std::fs::remove_dir_all(dest)?;
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    copy_tree_inner(src, dest, keep_symlinks)
}

fn copy_tree_inner(src: &Path, dest: &Path, keep_symlinks: bool) -> std::io::Result<()> {
    if src
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n == ".git")
    {
        return Ok(());
    }
    if src.is_symlink() && keep_symlinks {
        let target = std::fs::read_link(src)?;
        #[cfg(unix)]
        std::os::unix::fs::symlink(target, dest)?;
        #[cfg(windows)]
        {
            if src.is_dir() {
                std::os::windows::fs::symlink_dir(target, dest)?;
            } else {
                std::os::windows::fs::symlink_file(target, dest)?;
            }
        }
        return Ok(());
    }
    if src.is_dir() {
        std::fs::create_dir_all(dest)?;
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            copy_tree_inner(&entry.path(), &dest.join(entry.file_name()), keep_symlinks)?;
        }
        return Ok(());
    }
    std::fs::copy(src, dest)?;
    Ok(())
}

pub fn replace_symlink(link: &Path, target: &Path) -> std::io::Result<()> {
    if let Some(parent) = link.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if link.exists() || link.is_symlink() {
        if link.is_dir() && !link.is_symlink() {
            std::fs::remove_dir_all(link)?;
        } else {
            std::fs::remove_file(link)?;
        }
    }
    #[cfg(unix)]
    std::os::unix::fs::symlink(target, link)?;
    #[cfg(windows)]
    {
        if target.is_dir() {
            std::os::windows::fs::symlink_dir(target, link)?;
        } else {
            std::os::windows::fs::symlink_file(target, link)?;
        }
    }
    Ok(())
}
