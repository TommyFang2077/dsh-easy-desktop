mod shell_updater;

use std::io::Cursor;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use dsh_core::clipboard::{
    detect_image_mime, file_from_bytes, filename_for_mime, files_from_paths, parse_uri_list,
    ClipboardFile,
};
use dsh_core::launcher::{DshLauncher, DshProcess, URL_TIMEOUT_SECONDS};
use dsh_core::modlens::ensure_modlens;
use dsh_core::paths::BundledPaths;
use dsh_core::preset::ensure_anchored_standard;
use dsh_core::updater::{
    mark_update_checked, provision_bundled_dsh, provision_bundled_node, update_check_due,
    update_dsh,
};
use dsh_core::{APP_NAME, ENV_NO_UPDATE};
use serde::Serialize;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;

const INJECT: &str = concat!(
    include_str!("../../ui/inject/ingest.js"),
    include_str!("../../ui/inject/hide-twins.js"),
    include_str!("../../ui/inject/chrome.js"),
);

#[derive(Clone, Debug)]
pub struct Args {
    pub dsh: Option<String>,
    pub cwd: Option<PathBuf>,
    pub no_update: bool,
    pub force_update: bool,
    pub dev: bool,
    pub verbose: bool,
}

impl Args {
    pub fn parse() -> Self {
        let mut args = Args {
            dsh: std::env::var(dsh_core::ENV_BIN_OVERRIDE)
                .ok()
                .filter(|s| !s.is_empty()),
            cwd: std::env::var(dsh_core::ENV_CWD_OVERRIDE)
                .ok()
                .filter(|s| !s.is_empty())
                .map(PathBuf::from),
            no_update: std::env::var(ENV_NO_UPDATE)
                .map(|v| matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
                .unwrap_or(false),
            force_update: false,
            dev: false,
            verbose: false,
        };
        let mut argv = std::env::args().skip(1);
        while let Some(arg) = argv.next() {
            match arg.as_str() {
                "--dsh" => args.dsh = argv.next(),
                "--cwd" => args.cwd = argv.next().map(PathBuf::from),
                "--no-update" => args.no_update = true,
                "--update" => args.force_update = true,
                "--dev" => args.dev = true,
                "--verbose" => args.verbose = true,
                "--help" | "-h" => {
                    print_help();
                    std::process::exit(0);
                }
                "--version" | "-V" => {
                    println!("{APP_NAME} {}", dsh_core::VERSION);
                    std::process::exit(0);
                }
                _ => {}
            }
        }
        args
    }
}

fn print_help() {
    println!(
        "{APP_NAME} — native window around the official dsh WebUI.\n\n\
         --dsh PATH     dsh 可执行文件路径或命令\n\
         --cwd DIR      传给 dsh 的工作目录\n\
         --no-update    不检查 dsh 更新\n\
         --update       启动前强制检查/安装 dsh 更新\n\
         --dev          打开 WebView 开发者工具\n\
         --verbose      输出调试日志"
    );
}

struct AppState {
    args: Args,
    paths: BundledPaths,
    process: Mutex<Option<Arc<DshProcess>>>,
    url: Mutex<Option<String>>,
    initial_boot_started: AtomicBool,
}

impl AppState {
    fn stop(&self) {
        if let Ok(mut slot) = self.process.lock() {
            if let Some(proc) = slot.take() {
                proc.stop();
            }
        }
    }
}

#[derive(Clone, Serialize)]
struct StatusPayload {
    message: String,
    progress: Option<u8>,
}

fn emit_status(app: &AppHandle, message: impl Into<String>, progress: Option<u8>) {
    let _ = app.emit(
        "status",
        StatusPayload {
            message: message.into(),
            progress,
        },
    );
}

#[derive(Clone, Serialize)]
struct ErrorPayload {
    message: String,
    detail: String,
}

#[derive(Clone, Serialize)]
struct ReadyPayload {
    url: String,
}

#[tauri::command]
fn restart(app: AppHandle) {
    thread::spawn(move || boot(app));
}
fn start_initial_boot(app: AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    if state.initial_boot_started.swap(true, Ordering::AcqRel) {
        return;
    }
    thread::spawn(move || boot(app));
}

#[tauri::command]
async fn check_shell_update(app: AppHandle) -> Option<shell_updater::UpdateInfo> {
    match shell_updater::check(&app).await {
        Ok(Some(update)) => Some(update),
        Ok(None) => {
            start_initial_boot(app);
            None
        }
        Err(error) => {
            log::warn!("shell update check failed: {error}");
            start_initial_boot(app);
            None
        }
    }
}

#[tauri::command]
async fn install_shell_update(app: AppHandle) -> Result<(), String> {
    shell_updater::install(&app).await
}

#[tauri::command]
fn skip_shell_update(app: AppHandle) {
    start_initial_boot(app);
}

#[tauri::command]
fn open_in_browser(state: tauri::State<AppState>) -> Result<(), String> {
    let url = state
        .url
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .ok_or_else(|| "服务尚未就绪".to_string())?;
    open::that(&url).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_clipboard_images(app: AppHandle) -> Result<Vec<ClipboardFile>, String> {
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = tx.send(read_images());
    })
    .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())?
}

fn read_images() -> Result<Vec<ClipboardFile>, String> {
    if let Some(file) = read_native_image() {
        return Ok(vec![file]);
    }
    if let Some(file) = read_arboard_image() {
        return Ok(vec![file]);
    }
    if let Some(file) = read_cli_image() {
        return Ok(vec![file]);
    }
    if let Some(files) = read_arboard_image_paths() {
        return Ok(files);
    }
    Ok(Vec::new())
}

#[cfg(target_os = "linux")]
fn read_native_image() -> Option<ClipboardFile> {
    let clipboard = gtk::Clipboard::get(&gdk::SELECTION_CLIPBOARD);
    let pixbuf = clipboard.wait_for_image()?;
    let png = pixbuf.save_to_bufferv("png", &[]).ok()?;
    file_from_bytes(filename_for_mime("image/png", 0), "image/png".into(), png)
}

#[cfg(not(target_os = "linux"))]
fn read_native_image() -> Option<ClipboardFile> {
    None
}

fn read_arboard_image() -> Option<ClipboardFile> {
    let mut clipboard = arboard::Clipboard::new().ok()?;
    let img = clipboard.get_image().ok()?;
    let width = img.width as u32;
    let height = img.height as u32;
    let bytes = img.bytes.into_owned();
    let buffer = image::RgbaImage::from_raw(width, height, bytes)?;
    let mut png = Vec::new();
    buffer
        .write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)
        .ok()?;
    file_from_bytes(filename_for_mime("image/png", 0), "image/png".into(), png)
}

fn read_arboard_image_paths() -> Option<Vec<ClipboardFile>> {
    let mut clipboard = arboard::Clipboard::new().ok()?;
    let text = clipboard.get_text().ok()?;
    let loaded = files_from_paths(parse_uri_list(&text));
    if loaded.is_empty() {
        None
    } else {
        Some(loaded)
    }
}

fn read_cli_image() -> Option<ClipboardFile> {
    const ATTEMPTS: &[(&str, &[&str])] = &[
        ("wl-paste", &["--type", "image/png"]),
        ("wl-paste", &["--type", "image/jpeg"]),
        ("wl-paste", &["--type", "image/webp"]),
        (
            "xclip",
            &["-selection", "clipboard", "-t", "image/png", "-o"],
        ),
        (
            "xclip",
            &["-selection", "clipboard", "-t", "image/jpeg", "-o"],
        ),
        (
            "xclip",
            &["-selection", "clipboard", "-t", "image/webp", "-o"],
        ),
    ];
    for (bin, args) in ATTEMPTS {
        let output = match Command::new(bin).args(*args).output() {
            Ok(output) => output,
            Err(_) => continue,
        };
        if !output.status.success() || output.stdout.is_empty() {
            continue;
        }
        let mime = detect_image_mime(&output.stdout).unwrap_or("image/png");
        if let Some(file) = file_from_bytes(filename_for_mime(mime, 0), mime.into(), output.stdout)
        {
            return Some(file);
        }
    }
    None
}

fn enable_microphone(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "linux")]
    {
        let _ = window.with_webview(|platform| {
            use gtk::glib::{object::ObjectExt, StaticType};
            use webkit2gtk::{PermissionRequestExt, SettingsExt, WebViewExt};
            let webview = platform.inner();
            if let Some(settings) = webview.settings() {
                settings.set_enable_media_stream(true);
                settings.set_enable_mediasource(true);
            }
            webview.connect_permission_request(|_, request| {
                if request
                    .type_()
                    .is_a(webkit2gtk::UserMediaPermissionRequest::static_type())
                {
                    request.allow();
                    true
                } else {
                    false
                }
            });
        });
    }
    let _ = window;
}

fn is_internal(url: &Url) -> bool {
    matches!(url.scheme(), "tauri" | "asset" | "about" | "data" | "blob")
        || matches!(
            url.host_str(),
            Some("127.0.0.1" | "localhost" | "::1" | "tauri.localhost")
        )
}

fn boot(app: AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    state.stop();
    let started = Instant::now();
    emit_status(&app, "正在准备 DeepSeek Harness…", Some(5));
    emit_status(&app, "正在部署内置 Node.js 与 npm（1/3）…", Some(25));
    match provision_bundled_node(&state.paths) {
        Ok(Some(version)) => log::info!("bundled Node.js runtime ready: {version}"),
        Ok(None) => log::info!("no bundled Node.js runtime required"),
        Err(error) => {
            let _ = app.emit(
                "error",
                ErrorPayload {
                    message: "内置 Node.js 准备失败。".into(),
                    detail: error.to_string(),
                },
            );
            log::warn!(
                "bundled Node.js runtime failed to prepare: {}; continuing with fallbacks",
                error
            );
        }
    }
    emit_status(&app, "正在部署内置 DeepSeek Harness（2/3）…", Some(60));

    match provision_bundled_dsh(&state.paths) {
        Ok(Some(version)) => log::info!("official dsh core ready: {version}"),
        Ok(None) => log::warn!("packaged official dsh core not found; using launcher fallbacks"),
        Err(error) => {
            let _ = app.emit(
                "error",
                ErrorPayload {
                    message: "内置 dsh 准备失败。".into(),
                    detail: error.to_string(),
                },
            );
            log::warn!(
                "packaged official dsh core failed to prepare: {}; continuing with fallbacks",
                error.to_string()
            );
        }
    }

    if state.args.force_update && !state.args.no_update {
        emit_status(&app, "正在检查 dsh 更新…", Some(75));
        let result = update_dsh(true);
        mark_update_checked();
        log::info!("dsh update: {} ({})", result.status, result.message);
    }

    let plugin = ensure_modlens(&state.paths);
    log::info!(
        "modlens: {} ({}) in {:?}",
        plugin.status,
        plugin.message,
        started.elapsed()
    );
    let preset = ensure_anchored_standard(&state.paths);
    log::info!(
        "anchored-standard: {} ({}) in {:?}",
        preset.status,
        preset.message,
        started.elapsed()
    );
    emit_status(&app, "正在启动内置 DeepSeek Harness（3/3）…", Some(90));

    let launcher = DshLauncher::new(state.args.dsh.clone(), state.args.cwd.clone());
    let missing = match launcher.resolve() {
        Ok(_) => !launcher.has_installed_dsh().unwrap_or(true),
        Err(error) => error.is_missing(),
    };
    let mut bootstrap_message: Option<String> = None;
    if missing && !state.args.no_update {
        emit_status(&app, "未检测到 DeepSeek Harness，正在安装…", Some(80));
        let result = update_dsh(true);
        mark_update_checked();
        log::info!(
            "dsh not found; bootstrap install: {} ({})",
            result.status,
            result.message
        );
        bootstrap_message = Some(result.message);
    }
    let process = match launcher.start() {
        Ok(p) => Arc::new(p),
        Err(err) => {
            let detail = bootstrap_message
                .map(|message| format!("{message}\n{err}"))
                .unwrap_or_default();
            let _ = app.emit(
                "error",
                ErrorPayload {
                    message: err.to_string(),
                    detail,
                },
            );
            return;
        }
    };
    if let Ok(mut slot) = state.process.lock() {
        *slot = Some(Arc::clone(&process));
    }
    log::info!("dsh web spawned in {:?}", started.elapsed());

    if !state.args.no_update && !state.args.force_update && update_check_due() {
        thread::spawn(|| {
            log::info!("background dsh update check");
            let result = update_dsh(true);
            mark_update_checked();
            log::info!(
                "background dsh update: {} ({})",
                result.status,
                result.message
            );
        });
    }

    let deadline = Instant::now() + Duration::from_secs(URL_TIMEOUT_SECONDS);
    loop {
        if let Some(url) = process.take_url() {
            if let Ok(mut slot) = state.url.lock() {
                *slot = Some(url.clone());
            }
            let _ = app.emit("ready", ReadyPayload { url });
            log::info!("dsh web ready in {:?}", started.elapsed());
            return;
        }
        if let Some(code) = process.poll() {
            let detail = process.snapshot_lines().join("\n");
            let _ = app.emit(
                "error",
                ErrorPayload {
                    message: format!("服务已退出（exit {code}）。"),
                    detail,
                },
            );
            return;
        }
        if Instant::now() >= deadline {
            let detail = process
                .snapshot_lines()
                .into_iter()
                .rev()
                .take(80)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n");
            process.stop();
            let _ = app.emit(
                "error",
                ErrorPayload {
                    message: format!("等待 dsh web 输出 URL 超时（{URL_TIMEOUT_SECONDS} 秒）。"),
                    detail,
                },
            );
            return;
        }
        thread::sleep(Duration::from_millis(80));
    }
}

pub fn run() {
    let args = Args::parse();
    env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or(if args.verbose { "debug" } else { "info" }),
    )
    .init();

    let mut paths = BundledPaths::discover();
    let dev = args.dev;
    let updater = match shell_updater::public_key() {
        Some(public_key) => tauri_plugin_updater::Builder::new().pubkey(public_key),
        None => tauri_plugin_updater::Builder::new(),
    }
    .build();

    tauri::Builder::default()
        .plugin(updater)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(move |app| {
            if let Ok(dir) = app.path().resource_dir() {
                paths = paths.with_resource_dir(dir);
            }
            app.manage(AppState {
                args: args.clone(),
                paths,
                process: Mutex::new(None),
                url: Mutex::new(None),
                initial_boot_started: AtomicBool::new(false),
            });

            let mut builder =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title(APP_NAME)
                    .inner_size(1320.0, 860.0)
                    .min_inner_size(800.0, 560.0)
                    .decorations(false)
                    .resizable(true)
                    .initialization_script(INJECT)
                    .on_page_load(|window, payload| {
                        if payload.event() == PageLoadEvent::Finished
                            && matches!(payload.url().scheme(), "http" | "https")
                            && is_internal(payload.url())
                        {
                            let _ = window.eval(INJECT);
                        }
                    })
                    .on_navigation(|url| {
                        if is_internal(&url) {
                            true
                        } else {
                            let _ = open::that(url.as_str());
                            false
                        }
                    });

            if let Some(icon) = app.default_window_icon().cloned() {
                builder = builder.icon(icon)?;
            }

            if dev {
                builder = builder.devtools(true);
            }

            let window = builder.build()?;
            if dev {
                window.open_devtools();
            }
            enable_microphone(&window);

            let _ = window;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            restart,
            open_in_browser,
            read_clipboard_images,
            check_shell_update,
            install_shell_update,
            skip_shell_update,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.try_state::<AppState>() {
                    state.stop();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running DeepSeek Harness Desktop");
}
