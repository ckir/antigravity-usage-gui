#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Thin Tauri shell (Task 5): window, tray icon + tooltip, autostart, updater,
//! and the IPC handler surface. No quota/auth/scheduler logic lives here —
//! every handler below bridges to the Node sidecar (`dist-backend/runner.cjs`,
//! built by `npm run build:backend` from `src-tauri/backend/` + `src-core/`),
//! spawned once per invoke with a single-line JSON envelope on stdout:
//! `{ "ok": true, "result": … } | { "ok": false, "error": … }`.
//!
//! The sidecar needs a `node` runtime (>=18 per `engines`). Bundles ship the
//! runner as a resource; if `node` is missing the handlers return a clear
//! error instead of failing silently. Shipping a pinned node binary as a
//! Tauri sidecar (so end users need no system node) is a follow-up.

use std::path::PathBuf;
use std::process::Command;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_opener::OpenerExt;

// ---------------------------------------------------------------------------
// Sidecar bridge
// ---------------------------------------------------------------------------

/// Locate the bundled backend runner:
/// 1. `$ANTIGRAVITY_BACKEND_RUNNER` (dev override / tests),
/// 2. the app resource dir (installed bundles — see `bundle.resources`),
/// 3. `dist-backend/runner.cjs` next to the crate (dev via `tauri dev`).
fn backend_runner(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("ANTIGRAVITY_BACKEND_RUNNER") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Ok(p);
        }
        return Err(format!("ANTIGRAVITY_BACKEND_RUNNER is not a file: {}", p.display()));
    }
    if let Ok(dir) = app.path().resource_dir() {
        for candidate in [dir.join("runner.cjs"), dir.join("dist-backend/runner.cjs")] {
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist-backend/runner.cjs");
    if dev.is_file() {
        return Ok(dev);
    }
    Err("backend runner not found: run `npm run build:backend` (dev) or reinstall the bundle".into())
}

/// Spawn `node <runner> <method> '<json-args>'` and decode the envelope.
fn call_backend<T: serde::de::DeserializeOwned>(
    app: &AppHandle,
    method: &str,
    args: serde_json::Value,
) -> Result<T, String> {
    let runner = backend_runner(app)?;
    let output = Command::new("node")
        .arg(&runner)
        .arg(method)
        .arg(args.to_string())
        .output()
        .map_err(|e| {
            format!("failed to spawn node backend (is node >=18 installed?): {e}")
        })?;
    let line = String::from_utf8_lossy(&output.stdout)
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("")
        .to_string();
    let envelope: serde_json::Value =
        serde_json::from_str(&line).map_err(|e| {
            format!(
                "backend {method} returned non-JSON output: {e}; stderr: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            )
        })?;
    if envelope.get("ok").and_then(|v| v.as_bool()) == Some(true) {
        let result = envelope.get("result").cloned().unwrap_or(serde_json::Value::Null);
        serde_json::from_value(result).map_err(|e| format!("backend {method} result decode: {e}"))
    } else {
        Err(envelope
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown backend error")
            .to_string())
    }
}

// ---------------------------------------------------------------------------
// IPC handlers — full list (Tasks 2-4 surface + Task 5 tray).
// JS arg names are camelCase; Tauri maps them to the snake_case params.
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_quota(
    app: AppHandle,
    method: Option<String>,
    account: Option<String>,
    refresh: Option<bool>,
    all_models: Option<bool>,
) -> Result<serde_json::Value, String> {
    call_backend(
        &app,
        "get_quota",
        serde_json::json!({ "method": method, "account": account, "refresh": refresh, "allModels": all_models }),
    )
}

#[tauri::command]
fn get_all_quotas(app: AppHandle, refresh: Option<bool>) -> Result<serde_json::Value, String> {
    call_backend(&app, "get_all_quotas", serde_json::json!({ "refresh": refresh }))
}

#[tauri::command]
fn accounts_list(app: AppHandle) -> Result<Vec<String>, String> {
    call_backend(&app, "accounts_list", serde_json::Value::Null)
}

#[tauri::command]
fn accounts_current(app: AppHandle) -> Result<Option<String>, String> {
    call_backend(&app, "accounts_current", serde_json::Value::Null)
}

#[tauri::command]
fn accounts_switch(app: AppHandle, email: String) -> Result<(), String> {
    let _: serde_json::Value =
        call_backend(&app, "accounts_switch", serde_json::json!({ "email": email }))?;
    Ok(())
}

#[tauri::command]
fn accounts_remove(app: AppHandle, email: String) -> Result<(), String> {
    let _: serde_json::Value =
        call_backend(&app, "accounts_remove", serde_json::json!({ "email": email }))?;
    Ok(())
}

#[tauri::command]
fn accounts_refresh(app: AppHandle, email: Option<String>) -> Result<Vec<String>, String> {
    call_backend(&app, "accounts_refresh", serde_json::json!({ "email": email }))
}

/// Complete a manual (paste-URL) login against staged `login_start` state.
#[tauri::command]
fn accounts_add(app: AppHandle, manual_url: String) -> Result<String, String> {
    call_backend(&app, "accounts_add", serde_json::json!({ "manualUrl": manual_url }))
}

/// Start a login and return the Google OAuth URL. Auto mode also opens the
/// system browser (via the opener plugin); the localhost callback is served
/// by a detached sidecar (`login-wait`). Manual mode only stages state for
/// the paste-URL dialog (`accounts_add`).
#[tauri::command]
fn login_start(app: AppHandle, manual: Option<bool>) -> Result<String, String> {
    let manual = manual.unwrap_or(false);
    let url: String = call_backend(&app, "login_start", serde_json::json!({ "manual": manual }))?;
    if !manual {
        app.opener()
            .open_url(&url, None::<&str>)
            .map_err(|e| format!("failed to open system browser: {e}"))?;
    }
    Ok(url)
}

#[tauri::command]
fn login_cancel(app: AppHandle) -> Result<bool, String> {
    call_backend(&app, "login_cancel", serde_json::Value::Null)
}

#[tauri::command]
fn doctor(app: AppHandle) -> Result<serde_json::Value, String> {
    call_backend(&app, "doctor", serde_json::Value::Null)
}

#[tauri::command]
fn wakeup_config(app: AppHandle) -> Result<serde_json::Value, String> {
    call_backend(&app, "wakeup_config", serde_json::Value::Null)
}

#[tauri::command]
fn wakeup_install(
    app: AppHandle,
    config: serde_json::Value,
    cooldown_ms: Option<u64>,
) -> Result<(), String> {
    let _: serde_json::Value = call_backend(
        &app,
        "wakeup_install",
        serde_json::json!({ "config": config, "cooldownMs": cooldown_ms }),
    )?;
    Ok(())
}

#[tauri::command]
fn wakeup_uninstall(app: AppHandle) -> Result<(), String> {
    let _: serde_json::Value = call_backend(&app, "wakeup_uninstall", serde_json::Value::Null)?;
    Ok(())
}

#[tauri::command]
fn wakeup_test(
    app: AppHandle,
    email: String,
    model: String,
    prompt: Option<String>,
) -> Result<serde_json::Value, String> {
    call_backend(
        &app,
        "wakeup_test",
        serde_json::json!({ "email": email, "model": model, "prompt": prompt }),
    )
}

#[tauri::command]
fn wakeup_history(app: AppHandle, limit: Option<u64>) -> Result<serde_json::Value, String> {
    call_backend(&app, "wakeup_history", serde_json::json!({ "limit": limit }))
}

#[tauri::command]
fn wakeup_status(app: AppHandle) -> Result<serde_json::Value, String> {
    call_backend(&app, "wakeup_status", serde_json::Value::Null)
}

/// Live-update the tray tooltip (driven by `TrayMenu.setTrayTooltip`).
#[tauri::command]
fn tray_tooltip(app: AppHandle, tooltip: String) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_tooltip(Some(tooltip))
            .map_err(|e| format!("failed to set tray tooltip: {e}"))?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Tray: tooltip + click-to-show + Show/Quit menu. The tooltip is
            // refreshed live from the frontend (`tray_tooltip`) with the
            // lowest quota % (see `src/components/TrayMenu.ts`).
            let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))
                .expect("bundled tray icon parses");
            let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::with_id("main-tray")
                .tooltip("antigravity-usage")
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // Autostart on login (best-effort: OS policy may refuse; the
            // error is logged, not fatal — the toggle remains available via
            // OS settings once enabled).
            let launch = app.autolaunch();
            if !launch.is_enabled().unwrap_or(true) {
                if let Err(e) = launch.enable() {
                    eprintln!("autostart enable failed (non-fatal): {e}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_quota,
            get_all_quotas,
            accounts_list,
            accounts_switch,
            accounts_remove,
            accounts_refresh,
            accounts_current,
            accounts_add,
            login_start,
            login_cancel,
            doctor,
            wakeup_config,
            wakeup_install,
            wakeup_uninstall,
            wakeup_test,
            wakeup_history,
            wakeup_status,
            tray_tooltip
        ])
        .run(tauri::generate_context!())
        .expect("tauri failed");
}
