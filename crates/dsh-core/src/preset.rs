use std::path::{Path, PathBuf};

use regex::Regex;

use crate::paths::{copy_tree, dsh_home, BundledPaths};

pub const PRESET_ID: &str = "anchored-standard";
pub const ZERO_PRESET_ID: &str = "zero-anchored-standard";
pub const SOURCE_MARKER: &str = ".dsh-desktop-source";
pub const DEFAULT_BLOCK: &str = "agent-presets:\n  default: anchored-standard\n";
pub const PRESET_NAME_ZH: &str = "锚定式标准（实验）";
pub const PRESET_DESCRIPTION_ZH: &str =
    "首轮使用 Minimal 的真实工具对（持久 bash + str_replace_editor），不自动注入工作区或技能上下文；首次工具调用或回复后开放完整 Standard 工具。";
pub const ZERO_PRESET_NAME_ZH: &str = "零工具锚定式标准（实验）";
pub const ZERO_PRESET_DESCRIPTION_ZH: &str =
    "先插入一轮无工具的锚定对话（固定提示），从下一轮起开放完整 Standard 工具。";

#[derive(Debug, Clone)]
pub struct BundledPreset {
    pub preset_id: &'static str,
    pub name_zh: &'static str,
    pub description_zh: &'static str,
}

pub const BUNDLED_PRESETS: &[BundledPreset] = &[
    BundledPreset {
        preset_id: PRESET_ID,
        name_zh: PRESET_NAME_ZH,
        description_zh: PRESET_DESCRIPTION_ZH,
    },
    BundledPreset {
        preset_id: ZERO_PRESET_ID,
        name_zh: ZERO_PRESET_NAME_ZH,
        description_zh: ZERO_PRESET_DESCRIPTION_ZH,
    },
];

#[derive(Debug, Clone)]
pub struct PresetEnsureResult {
    pub status: &'static str,
    pub version: Option<String>,
    pub message: String,
}

pub fn preset_install_dir(preset_id: &str) -> PathBuf {
    dsh_home().join(".agent-presets").join(preset_id)
}

fn is_preset_dir(path: &Path) -> bool {
    path.is_dir() && path.join("preset.yml").is_file()
}

pub fn read_source_version(path: &Path) -> Option<String> {
    let version = std::fs::read_to_string(path.join(SOURCE_MARKER)).ok()?;
    let version = version.trim();
    if version.is_empty() {
        None
    } else {
        Some(version.to_string())
    }
}

pub fn bundled_preset_dir(paths: &BundledPaths, preset_id: &str) -> Option<PathBuf> {
    paths
        .find_dir(preset_id, "preset.yml")
        .or_else(|| paths.find_dir(&format!("vendor/{preset_id}"), "preset.yml"))
        .filter(|p| is_preset_dir(p))
}

pub fn ensure_default_preset(text: &str) -> String {
    let mut body = text.replace("\r\n", "\n");
    if !body.ends_with('\n') {
        body.push('\n');
    }
    if body.trim().is_empty() {
        return DEFAULT_BLOCK.to_string();
    }
    let re = Regex::new(r"(?m)^agent-presets:\n((?:[ \t]+.*\n)*)").unwrap();
    let Some(caps) = re.captures(&body) else {
        body.push('\n');
        body.push_str(DEFAULT_BLOCK);
        return body;
    };
    let inner = caps.get(1).unwrap().as_str();
    if Regex::new(r"(?m)^[ \t]+default:\s*\S+")
        .unwrap()
        .is_match(inner)
    {
        return body;
    }
    let insert = format!("  default: {PRESET_ID}\n");
    let start = caps.get(1).unwrap().start();
    let end = caps.get(1).unwrap().end();
    format!("{}{}{}{}", &body[..start], insert, inner, &body[end..])
}

pub fn localize_preset_yml(text: &str, name: &str, description: &str) -> String {
    let mut body = text.replace("\r\n", "\n");
    if !body.ends_with('\n') {
        body.push('\n');
    }
    let name_line = format!("name: {}\n", serde_json::to_string(name).unwrap());
    let desc_line = format!(
        "description: {}\n",
        serde_json::to_string(description).unwrap()
    );
    let name_re = Regex::new(r"(?m)^name:.*\n").unwrap();
    if let Some(m) = name_re.find(&body) {
        body = format!("{}{}{}", &body[..m.start()], name_line, &body[m.end()..]);
    } else {
        body = format!("{name_line}{body}");
    }
    let desc_re = Regex::new(r"(?m)^description:(?:[ \t].*)?\n(?:[ \t].+\n)*").unwrap();
    if let Some(m) = desc_re.find(&body) {
        return format!("{}{}{}", &body[..m.start()], desc_line, &body[m.end()..]);
    }
    if let Some(m) = name_re.find(&body) {
        return format!("{}{}{}", &body[..m.end()], desc_line, &body[m.end()..]);
    }
    format!("{desc_line}{body}")
}

fn write_localized_preset(dest: &Path, spec: &BundledPreset) -> std::io::Result<()> {
    let path = dest.join("preset.yml");
    let previous = std::fs::read_to_string(&path)?;
    let updated = localize_preset_yml(&previous, spec.name_zh, spec.description_zh);
    if updated != previous {
        std::fs::write(path, updated)?;
    }
    Ok(())
}

fn short_version(version: Option<&str>) -> String {
    match version {
        None => "bundled".into(),
        Some(v) if v.len() > 12 => v[..12].into(),
        Some(v) => v.into(),
    }
}

fn ensure_one(paths: &BundledPaths, spec: &BundledPreset) -> PresetEnsureResult {
    let src = bundled_preset_dir(paths, spec.preset_id);
    let dest = preset_install_dir(spec.preset_id);
    let bundled = src.as_ref().and_then(|p| read_source_version(p));
    let installed = if dest.is_dir() {
        read_source_version(&dest)
    } else {
        None
    };
    let version = bundled.clone().or_else(|| installed.clone());
    let label = spec.name_zh;
    if src.is_none() {
        if dest.is_dir() && dest.join("preset.yml").is_file() {
            let _ = write_localized_preset(&dest, spec);
            return PresetEnsureResult {
                status: "current",
                version: version.clone(),
                message: format!("已配置已安装的{label}（{}）", short_version(version.as_deref())),
            };
        }
        return PresetEnsureResult {
            status: "skipped",
            version: None,
            message: format!("未找到内置{label}，跳过安装"),
        };
    }
    let src = src.unwrap();
    if let Err(exc) = (|| -> std::io::Result<()> {
        if installed != bundled || !dest.join("preset.yml").is_file() {
            copy_tree(&src, &dest, false)?;
        }
        write_localized_preset(&dest, spec)?;
        Ok(())
    })() {
        return PresetEnsureResult {
            status: "failed",
            version,
            message: format!("内置{label}安装失败：{exc}"),
        };
    }
    let sha = short_version(bundled.as_deref());
    if installed == bundled && dest.join("preset.yml").is_file() {
        return PresetEnsureResult {
            status: "current",
            version: bundled,
            message: format!("内置{label} {sha} 已就绪"),
        };
    }
    if installed.is_some() {
        return PresetEnsureResult {
            status: "updated",
            version: bundled,
            message: format!("已将内置{label}更新到 {sha}"),
        };
    }
    PresetEnsureResult {
        status: "installed",
        version: bundled,
        message: format!("已启用内置{label} {sha}"),
    }
}

fn combine(results: &[PresetEnsureResult]) -> PresetEnsureResult {
    if results.iter().any(|item| item.status == "failed") {
        let failed: Vec<_> = results
            .iter()
            .filter(|item| item.status == "failed")
            .map(|item| item.message.clone())
            .collect();
        return PresetEnsureResult {
            status: "failed",
            version: None,
            message: failed.join("；"),
        };
    }
    let active: Vec<_> = results
        .iter()
        .filter(|item| item.status != "skipped")
        .collect();
    if active.is_empty() {
        return PresetEnsureResult {
            status: "skipped",
            version: None,
            message: "未找到内置锚定预设，跳过安装".into(),
        };
    }
    let version = active.iter().find_map(|item| item.version.clone());
    let (status, lead) = if active.iter().any(|item| item.status == "updated") {
        ("updated", "已更新内置锚定预设")
    } else if active.iter().any(|item| item.status == "installed") {
        ("installed", "已启用内置锚定预设")
    } else {
        ("current", "内置锚定预设已就绪")
    };
    let detail = active
        .iter()
        .map(|item| item.message.as_str())
        .collect::<Vec<_>>()
        .join("；");
    PresetEnsureResult {
        status,
        version,
        message: format!("{lead}。{detail}"),
    }
}

pub fn ensure_anchored_standard(paths: &BundledPaths) -> PresetEnsureResult {
    let results: Vec<_> = BUNDLED_PRESETS
        .iter()
        .map(|spec| ensure_one(paths, spec))
        .collect();
    let combined = combine(&results);
    if combined.status == "failed" {
        return combined;
    }
    let settings = dsh_home().join("settings.yaml");
    match (|| -> std::io::Result<()> {
        let previous = if settings.is_file() {
            std::fs::read_to_string(&settings)?
        } else {
            String::new()
        };
        let updated = ensure_default_preset(&previous);
        if updated != previous {
            if let Some(parent) = settings.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&settings, updated)?;
        }
        Ok(())
    })() {
        Ok(()) => combined,
        Err(exc) => PresetEnsureResult {
            status: "failed",
            version: combined.version,
            message: format!("写入默认 preset 失败：{exc}"),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::BundledPaths;

    #[test]
    fn empty_file_gets_default_block() {
        assert_eq!(
            ensure_default_preset(""),
            "agent-presets:\n  default: anchored-standard\n"
        );
    }

    #[test]
    fn appends_when_section_missing() {
        let updated = ensure_default_preset("ui-theme:\n  preference: dark\n");
        assert!(updated.contains("preference: dark"));
        assert!(updated.contains("agent-presets:\n  default: anchored-standard\n"));
    }

    #[test]
    fn inserts_default_into_empty_section() {
        let updated = ensure_default_preset("agent-presets:\nui-theme:\n  preference: dark\n");
        assert!(updated.contains("agent-presets:\n  default: anchored-standard\n"));
        assert!(updated.contains("preference: dark"));
    }

    #[test]
    fn keeps_existing_default() {
        let original = "agent-presets:\n  default: standard\n";
        assert_eq!(ensure_default_preset(original), original);
    }

    #[test]
    fn does_not_match_permission_default_preset() {
        let original = "permission:\n  defaultPreset: danger-full-access\n";
        let updated = ensure_default_preset(original);
        assert!(updated.contains("defaultPreset: danger-full-access"));
        assert!(updated.contains("agent-presets:\n  default: anchored-standard\n"));
    }

    #[test]
    fn replaces_english_name_and_description() {
        let original = "\
name: Anchored Standard (experimental)
description: Bootstrap with the Minimal preset's real tool pair.
order: 5
";
        let updated = localize_preset_yml(original, PRESET_NAME_ZH, PRESET_DESCRIPTION_ZH);
        assert!(updated.contains(PRESET_NAME_ZH));
        assert!(updated.contains(PRESET_DESCRIPTION_ZH));
        assert!(!updated.contains("Anchored Standard (experimental)"));
        assert!(!updated.contains("Bootstrap"));
        assert!(updated.contains("order: 5"));
    }

    #[test]
    fn inserts_description_after_name() {
        let updated = localize_preset_yml("name: Anchored Standard\norder: 5\n", PRESET_NAME_ZH, PRESET_DESCRIPTION_ZH);
        assert!(updated.contains(PRESET_NAME_ZH));
        assert!(!updated.contains("name: Anchored Standard\n"));
        assert!(updated.contains(PRESET_DESCRIPTION_ZH));
        assert!(updated.contains("order: 5"));
    }

    #[test]
    fn installs_from_bundle_and_sets_default() {
        let tmp = tempfile::TempDir::new().unwrap();
        let src = tmp.path().join("anchored-standard");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("preset.yml"), "name: Anchored Standard\n").unwrap();
        std::fs::write(src.join(SOURCE_MARKER), "abc123def456\n").unwrap();
        let home = tmp.path().join(".dsh");
        std::env::set_var("DSH_HOME", &home);
        let paths = BundledPaths::discover().with_resource_dir(tmp.path().to_path_buf());
        let result = ensure_anchored_standard(&paths);
        std::env::remove_var("DSH_HOME");
        assert_eq!(result.status, "installed");
        let dest = home.join(".agent-presets").join(PRESET_ID);
        assert!(dest.join("preset.yml").is_file());
        let yml = std::fs::read_to_string(dest.join("preset.yml")).unwrap();
        assert!(yml.contains(PRESET_DESCRIPTION_ZH));
        let settings = std::fs::read_to_string(home.join("settings.yaml")).unwrap();
        assert!(settings.contains("default: anchored-standard"));
    }

    #[test]
    fn localizes_zero_preset() {
        let original = "\
name: Zero-Anchored Standard (experimental)
description: Inject one zero-tool anchor turn.
order: 6
";
        let updated = localize_preset_yml(original, ZERO_PRESET_NAME_ZH, ZERO_PRESET_DESCRIPTION_ZH);
        assert!(updated.contains(ZERO_PRESET_NAME_ZH));
        assert!(updated.contains(ZERO_PRESET_DESCRIPTION_ZH));
        assert!(!updated.contains("Zero-Anchored"));
    }
}
