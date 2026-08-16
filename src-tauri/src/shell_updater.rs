use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

const UPDATE_ENDPOINT: &str = "https://git.fangsiyuan.top/api/packages/TomHanck4/generic/dsh-easy-desktop-updater/latest/latest.json";
const UPDATE_TIMEOUT_SECONDS: u64 = 8;

pub fn public_key() -> Option<&'static str> {
    option_env!("DSH_DESKTOP_UPDATER_PUBKEY").filter(|key| !key.trim().is_empty())
}

#[derive(Clone, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

#[derive(Clone, Serialize)]
struct UpdateProgress {
    downloaded: u64,
    total: Option<u64>,
    percent: Option<u8>,
}

fn supported_install() -> bool {
    #[cfg(target_os = "linux")]
    {
        // Tauri's Linux updater replaces the running AppImage. A deb, rpm, or
        // Flatpak install must be updated by its package manager instead.
        std::env::var_os("APPIMAGE").is_some()
    }
    #[cfg(not(target_os = "linux"))]
    {
        true
    }
}

async fn find_update(app: &AppHandle) -> Result<Option<Update>, String> {
    let Some(public_key) = public_key() else {
        return Ok(None);
    };
    if !supported_install() {
        return Ok(None);
    }
    let endpoint = Url::parse(UPDATE_ENDPOINT).map_err(|error| error.to_string())?;
    app.updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|error| error.to_string())?
        .pubkey(public_key)
        .timeout(Duration::from_secs(UPDATE_TIMEOUT_SECONDS))
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())
}

pub async fn check(app: &AppHandle) -> Result<Option<UpdateInfo>, String> {
    Ok(find_update(app).await?.map(|update| UpdateInfo {
        version: update.version,
        notes: update.body,
    }))
}

pub async fn install(app: &AppHandle) -> Result<(), String> {
    let update = find_update(app)
        .await?
        .ok_or_else(|| "没有可安装的壳更新".to_string())?;
    let downloaded = Arc::new(AtomicU64::new(0));
    let progress_app = app.clone();
    let progress_downloaded = Arc::clone(&downloaded);
    update
        .download_and_install(
            move |chunk, total| {
                let downloaded =
                    progress_downloaded.fetch_add(chunk as u64, Ordering::Relaxed) + chunk as u64;
                let percent = total
                    .filter(|total| *total > 0)
                    .map(|total| ((downloaded.saturating_mul(100) / total).min(100)) as u8);
                let _ = progress_app.emit(
                    "shell-update-progress",
                    UpdateProgress {
                        downloaded,
                        total,
                        percent,
                    },
                );
            },
            {
                let app = app.clone();
                move || {
                    let total = downloaded.load(Ordering::Relaxed);
                    let _ = app.emit(
                        "shell-update-progress",
                        UpdateProgress {
                            downloaded: total,
                            total: Some(total),
                            percent: Some(100),
                        },
                    );
                }
            },
        )
        .await
        .map_err(|error| error.to_string())?;

    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_is_the_public_gitea_package() {
        let endpoint = Url::parse(UPDATE_ENDPOINT).unwrap();
        assert_eq!(endpoint.scheme(), "https");
        assert_eq!(endpoint.host_str(), Some("git.fangsiyuan.top"));
        assert!(endpoint.path().ends_with("/latest/latest.json"));
    }
}
