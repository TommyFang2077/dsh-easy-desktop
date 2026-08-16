use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use regex::Regex;
use serde_json::{json, Value};

use crate::paths::{copy_tree, dsh_home, replace_symlink, BundledPaths};

pub const PACKAGE: &str = "@liustack/modlens";
pub const VISION_PACKAGE: &str = "dsh-desktop-vision";
pub const MODLENS_VERSION: &str = "3.16.6";
pub const HIDE_PLAIN_TWINS_JS: &str = include_str!("../../../ui/inject/hide-twins.js");

pub const MANAGED_OVERLAY: &str = "\
# dsh-desktop manages this modlens overlay (wrap every text-only model).
- id: modlens
  config:
    autoRead: true
    families:
      - \"\"
";

const OFFICIAL_TEXT_PROVIDERS: &[(&str, &str)] = &[
    ("deepseek-official", "deepseek-modlens"),
    ("deepseek", "deepseek-modlens"),
];

#[derive(Debug, Clone)]
pub struct ModlensEnsureResult {
    pub status: &'static str,
    pub version: Option<String>,
    pub message: String,
}

pub fn web_profile_dir() -> PathBuf {
    dsh_home().join("profiles/web")
}

fn package_dir(prefix: &Path) -> PathBuf {
    prefix.join("node_modules/@liustack/modlens")
}

pub fn read_modlens_version(prefix: &Path) -> Option<String> {
    let text = std::fs::read_to_string(package_dir(prefix).join("package.json")).ok()?;
    let data: Value = serde_json::from_str(&text).ok()?;
    data.get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

pub fn bundled_vision_plugin(paths: &BundledPaths) -> Option<PathBuf> {
    paths
        .find_dir("vision", "package.json")
        .or_else(|| paths.find_dir("dsh-desktop-vision", "package.json"))
        .or_else(|| paths.find_dir("plugins/dsh-desktop-vision", "package.json"))
        .filter(|p| p.join("client.js").is_file())
}

pub fn bundled_modlens_prefix(paths: &BundledPaths) -> Option<PathBuf> {
    paths
        .find_dir("modlens", "node_modules/@liustack/modlens")
        .or_else(|| paths.find_dir("vendor/modlens", "node_modules/@liustack/modlens"))
}

fn install_into_profile(src_prefix: &Path, profile: &Path) -> std::io::Result<()> {
    let dest_pkg = package_dir(profile);
    copy_tree(&package_dir(src_prefix), &dest_pkg, true)?;
    let dest_nm = profile.join("node_modules");
    let src_nm = src_prefix.join("node_modules");
    for dep in ["commander", "undici"] {
        let src_dep = src_nm.join(dep);
        if src_dep.is_dir() {
            copy_tree(&src_dep, &dest_nm.join(dep), true)?;
        }
    }
    let fallback = dsh_home().join("profiles/node_modules/@liustack/modlens");
    let _ = replace_symlink(&fallback, &dest_pkg);
    Ok(())
}

fn read_pkg_version(dir: &Path) -> Option<String> {
    let text = std::fs::read_to_string(dir.join("package.json")).ok()?;
    let data: Value = serde_json::from_str(&text).ok()?;
    data.get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn install_vision_plugin(paths: &BundledPaths, profile: &Path) -> bool {
    let Some(src) = bundled_vision_plugin(paths) else {
        return false;
    };
    let dest = profile.join("node_modules").join(VISION_PACKAGE);
    let up_to_date = dest.join("client.js").is_file()
        && dest.join("index.js").is_file()
        && read_pkg_version(&dest) == read_pkg_version(&src);
    if !up_to_date && copy_tree(&src, &dest, true).is_err() {
        return false;
    }
    let fallback = dsh_home()
        .join("profiles/node_modules")
        .join(VISION_PACKAGE);
    let _ = replace_symlink(&fallback, &dest);
    true
}

fn ensure_manifest(profile: &Path, packages: &BTreeMap<String, String>) -> std::io::Result<()> {
    let path = profile.join("package.json");
    let mut data = if path.is_file() {
        serde_json::from_str(&std::fs::read_to_string(&path)?).unwrap_or_else(|_| json!({}))
    } else {
        json!({
            "name": "dsh-profile-web",
            "private": true,
            "dsh": {"profile": {"bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]}}
        })
    };
    {
        let obj = data.as_object_mut().unwrap();
        obj.entry("dependencies").or_insert_with(|| json!({}));
        let dsh = obj.entry("dsh").or_insert_with(|| json!({}));
        let profile_meta = dsh
            .as_object_mut()
            .unwrap()
            .entry("profile")
            .or_insert_with(|| json!({}));
        let bundles = profile_meta
            .as_object_mut()
            .unwrap()
            .entry("bundles")
            .or_insert_with(|| json!(["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]));
        if !bundles.is_array() {
            *bundles = json!(["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]);
        }
    }
    for (name, version) in packages {
        data["dependencies"][name] = json!(version);
        let arr = data["dsh"]["profile"]["bundles"].as_array_mut().unwrap();
        if !arr.iter().any(|v| v.as_str() == Some(name)) {
            arr.push(json!(name));
        }
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, serde_json::to_string_pretty(&data)? + "\n")
}

pub fn ensure_modlens_overlay(text: &str) -> String {
    let body = text.replace("\r\n", "\n");
    let stripped = body.trim();
    if stripped.is_empty() || stripped == "[]" || stripped == "#" {
        return MANAGED_OVERLAY.to_string();
    }
    let re = Regex::new(r"(?m)^- id:\s*modlens\s*$").unwrap();
    if re.is_match(&body) {
        return patch_existing_modlens_entry(&body);
    }
    let mut body = body;
    if !body.ends_with('\n') {
        body.push('\n');
    }
    body.push('\n');
    body.push_str(MANAGED_OVERLAY);
    body
}

fn patch_existing_modlens_entry(body: &str) -> String {
    let lines: Vec<&str> = body.split('\n').collect();
    let mut start = None;
    let start_re = Regex::new(r"^- id:\s*modlens\s*$").unwrap();
    for (index, line) in lines.iter().enumerate() {
        if start_re.is_match(line) {
            start = Some(index);
            break;
        }
    }
    let Some(start) = start else {
        let mut out = body.trim_end().to_string();
        out.push_str("\n\n");
        out.push_str(MANAGED_OVERLAY);
        return out;
    };
    let mut end = lines.len();
    for (index, line) in lines.iter().enumerate().skip(start + 1) {
        if line.starts_with("- ") && !line.starts_with(' ') {
            end = index;
            break;
        }
    }
    let block: Vec<String> = lines[start..end].iter().map(|s| (*s).to_string()).collect();
    let new_block = force_wrap_all_config(block).join("\n");
    let new_block = new_block.trim_end();
    let mut out = String::new();
    out.push_str(&lines[..start].join("\n"));
    if start > 0 && !out.ends_with('\n') && !out.is_empty() {
        out.push('\n');
    }
    // reconstruct like Python: lines[:start] + new_block.split + lines[end:]
    let mut combined: Vec<String> = lines[..start].iter().map(|s| (*s).to_string()).collect();
    combined.extend(new_block.split('\n').map(|s| s.to_string()));
    combined.extend(lines[end..].iter().map(|s| (*s).to_string()));
    let mut text = combined.join("\n");
    text = text.trim_end().to_string();
    text.push('\n');
    text
}

fn force_wrap_all_config(block: Vec<String>) -> Vec<String> {
    let config_re = Regex::new(r"^\s+config:\s*$").unwrap();
    let mut block = block;
    if !block.iter().any(|line| config_re.is_match(line)) {
        block.push("  config:".into());
    }
    let mut stripped = Vec::new();
    let mut skipping_families = false;
    let families_re = Regex::new(r"^\s+families:\s*").unwrap();
    let item_re = Regex::new(r"^\s+- ").unwrap();
    for line in block {
        if skipping_families {
            if item_re.is_match(&line) || line.trim().is_empty() {
                continue;
            }
            skipping_families = false;
        }
        if families_re.is_match(&line) {
            skipping_families = true;
            continue;
        }
        stripped.push(line);
    }
    let autoread_re = Regex::new(r"^\s+autoRead:\s*").unwrap();
    let has_autoread = stripped.iter().any(|line| autoread_re.is_match(line));
    let mut out = Vec::new();
    let mut inserted = false;
    for line in stripped {
        if autoread_re.is_match(&line) {
            let replaced = Regex::new(r"^(\s+autoRead:\s*).*$")
                .unwrap()
                .replace(&line, "${1}true");
            out.push(replaced.into_owned());
            out.push("    families:".into());
            out.push("      - \"\"".into());
            inserted = true;
            continue;
        }
        let is_config = config_re.is_match(&line);
        out.push(line);
        if is_config && !has_autoread && !inserted {
            out.push("    autoRead: true".into());
            out.push("    families:".into());
            out.push("      - \"\"".into());
            inserted = true;
        }
    }
    if !inserted {
        out.push("    autoRead: true".into());
        out.push("    families:".into());
        out.push("      - \"\"".into());
    }
    out
}

pub fn remap_default_text_model(settings_text: &str) -> String {
    let mut text = settings_text.to_string();
    if !text.ends_with('\n') {
        text.push('\n');
    }
    let re = Regex::new(r"(?m)^(agent-default-model:\n(?:  .*\n)*)").unwrap();
    let Some(caps) = re.captures(&text) else {
        return settings_text.to_string();
    };
    let block = caps.get(1).unwrap().as_str().to_string();
    let provider_re = Regex::new(r"(?m)^  provider:\s*(\S+)\s*$").unwrap();
    let Some(provider) = provider_re.captures(&block) else {
        return settings_text.to_string();
    };
    let current = provider[1].trim_matches(|c| c == '"' || c == '\'');
    let Some((_, wrapped)) = OFFICIAL_TEXT_PROVIDERS.iter().find(|(k, _)| *k == current) else {
        return settings_text.to_string();
    };
    let new_block = Regex::new(r"(?m)^(  provider:\s*)\S+\s*$")
        .unwrap()
        .replacen(&block, 1, format!("${{1}}{wrapped}"));
    let start = caps.get(1).unwrap().start();
    let end = caps.get(1).unwrap().end();
    let mut out = String::new();
    out.push_str(&text[..start]);
    out.push_str(&new_block);
    out.push_str(&text[end..]);
    if !settings_text.ends_with('\n') && out.ends_with('\n') {
        // keep a trailing newline; Python operated on the padded copy
    }
    out
}

pub fn ensure_modlens(paths: &BundledPaths) -> ModlensEnsureResult {
    let src = bundled_modlens_prefix(paths);
    let profile = web_profile_dir();
    let installed = read_modlens_version(&profile);
    let version = src
        .as_ref()
        .and_then(|p| read_modlens_version(p))
        .or_else(|| installed.clone())
        .unwrap_or_else(|| MODLENS_VERSION.to_string());

    match ensure_modlens_inner(paths, src.as_deref(), &profile, installed, &version) {
        Ok(result) => result,
        Err(exc) => ModlensEnsureResult {
            status: "failed",
            version: Some(version),
            message: format!("内置 ModLens 安装失败：{exc}"),
        },
    }
}

fn ensure_modlens_inner(
    paths: &BundledPaths,
    src: Option<&Path>,
    profile: &Path,
    installed: Option<String>,
    version: &str,
) -> std::io::Result<ModlensEnsureResult> {
    std::fs::create_dir_all(profile)?;
    let vision_ok = install_vision_plugin(paths, profile);
    let mut packages = BTreeMap::new();
    if vision_ok {
        packages.insert(VISION_PACKAGE.to_string(), "0.1.0".into());
    }
    if src.is_none() && installed.is_none() {
        if !packages.is_empty() {
            ensure_manifest(profile, &packages)?;
        }
        return Ok(ModlensEnsureResult {
            status: "skipped",
            version: None,
            message: "未找到内置 ModLens，跳过插件安装".into(),
        });
    }
    let installed_after = if let Some(src) = src {
        if installed.as_deref() != Some(version) {
            install_into_profile(src, profile)?;
            read_modlens_version(profile).unwrap_or_else(|| version.to_string())
        } else {
            installed.clone().unwrap_or_else(|| version.to_string())
        }
    } else {
        installed.clone().unwrap_or_else(|| version.to_string())
    };
    packages.insert(PACKAGE.to_string(), installed_after.clone());
    ensure_manifest(profile, &packages)?;
    let patch = profile.join("cordis.patch.yml");
    let previous = if patch.is_file() {
        std::fs::read_to_string(&patch)?
    } else {
        String::new()
    };
    let updated = ensure_modlens_overlay(&previous);
    if updated != previous {
        std::fs::write(&patch, updated)?;
    }
    let settings = dsh_home().join("settings.yaml");
    if settings.is_file() {
        let original = std::fs::read_to_string(&settings)?;
        let remapped = remap_default_text_model(&original);
        if remapped != original {
            std::fs::write(&settings, remapped)?;
        }
    }
    if src.is_none() {
        return Ok(ModlensEnsureResult {
            status: "current",
            version: Some(installed_after.clone()),
            message: format!("已配置已安装的 ModLens {installed_after}（纯文本自动套视觉桥）"),
        });
    }
    if installed.as_deref() == Some(version) {
        return Ok(ModlensEnsureResult {
            status: "current",
            version: Some(version.to_string()),
            message: format!("内置 ModLens {version} 已就绪"),
        });
    }
    if installed.is_some() {
        return Ok(ModlensEnsureResult {
            status: "updated",
            version: Some(version.to_string()),
            message: format!("已将内置 ModLens 更新到 {version}"),
        });
    }
    Ok(ModlensEnsureResult {
        status: "installed",
        version: Some(version.to_string()),
        message: format!("已启用内置 ModLens {version}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_file_gets_managed_overlay() {
        let text = ensure_modlens_overlay("");
        assert!(text.contains("id: modlens"));
        assert!(text.contains("autoRead: true"));
        assert!(text.contains("families:"));
        assert!(text.contains("- \"\""));
    }

    #[test]
    fn existing_modlens_gains_wrap_all_families() {
        let text = ensure_modlens_overlay("- id: modlens\n  config:\n    autoRead: true\n");
        assert!(text.contains("autoRead: true"));
        assert!(text.contains("      - \"\""));
    }

    #[test]
    fn replaces_narrow_families() {
        let original = "\
- id: modlens
  config:
    autoRead: true
    families:
      - deepseek
      - glm
";
        let text = ensure_modlens_overlay(original);
        assert!(!text.contains("deepseek"));
        assert!(!text.contains("glm"));
        assert!(text.contains("- \"\""));
    }

    #[test]
    fn keeps_other_entries() {
        let original =
            "- id: other\n  config:\n    x: 1\n- id: modlens\n  config:\n    autoRead: false\n";
        let text = ensure_modlens_overlay(original);
        assert!(text.contains("id: other"));
        assert!(text.contains("autoRead: true"));
        assert!(text.contains("      - \"\""));
    }

    #[test]
    fn official_deepseek_becomes_modlens() {
        let original = "\
agent-default-model:
  provider: deepseek-official
  model: deepseek-v4-pro
ui-theme:
  preference: dark
";
        let updated = remap_default_text_model(original);
        assert!(updated.contains("provider: deepseek-modlens"));
        assert!(updated.contains("model: deepseek-v4-pro"));
        assert!(updated.contains("preference: dark"));
    }

    #[test]
    fn qwen_is_left_alone() {
        let original = "agent-default-model:\n  provider: qwen\n  model: qwen-agent\n";
        assert_eq!(remap_default_text_model(original), original);
    }

    #[test]
    fn already_wrapped_is_left_alone() {
        let original =
            "agent-default-model:\n  provider: deepseek-modlens\n  model: deepseek-v4-pro\n";
        assert_eq!(remap_default_text_model(original), original);
    }

    #[test]
    fn hide_twins_script_targets_suffix() {
        assert!(HIDE_PLAIN_TWINS_JS.contains("(modlens vision)"));
        assert!(HIDE_PLAIN_TWINS_JS.contains("MutationObserver"));
    }
}
