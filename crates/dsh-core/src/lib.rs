//! Shared desktop-shell logic for DeepSeek Harness Desktop.
//!
//! This crate has no GUI dependency.  The Tauri (or any other) shell starts
//! `dsh web`, keeps the bundled plugins/presets current, and embeds the
//! official WebUI.

pub mod clipboard;
pub mod launcher;
pub mod modlens;
pub mod paths;
pub mod preset;
pub mod updater;

pub const APP_ID: &str = "io.github.tommyfang.DshDesktop";
pub const APP_NAME: &str = "DeepSeek Harness";
pub const APP_SUMMARY: &str = "Desktop shell for DeepSeek Harness";
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

pub const ENV_BIN_OVERRIDE: &str = "DSH_DESKTOP_DSH_BIN";
pub const ENV_CWD_OVERRIDE: &str = "DSH_DESKTOP_CWD";
pub const ENV_NO_UPDATE: &str = "DSH_DESKTOP_NO_UPDATE";
