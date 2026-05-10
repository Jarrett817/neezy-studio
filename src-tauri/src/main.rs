// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use log::info;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

mod system;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            info!("Neezy Studio starting up...");
            if let Ok(app_dir) = app.path().app_data_dir() {
                info!("App data dir: {:?}", app_dir);
            }
            if let Ok(resource_dir) = app.path().resource_dir() {
                info!("Resource dir: {:?}", resource_dir);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime_metrics,
            get_resource_path,
            start_ollama,
            stop_ollama,
            is_ollama_running,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn get_runtime_metrics(app: tauri::AppHandle) -> Result<system::RuntimeMetrics, String> {
    Ok(system::build_runtime_metrics(&app))
}

#[tauri::command]
fn get_resource_path(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .resource_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn is_ollama_running() -> Result<bool, String> {
    let output = std::process::Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq ollama.exe"])
        .output()
        .map_err(|e| e.to_string())?;
    let output_str = String::from_utf8_lossy(&output.stdout);
    let count = output_str.lines().count();
    Ok(count > 1)
}

#[tauri::command]
async fn start_ollama(app: tauri::AppHandle) -> Result<(), String> {
    // 先检查是否已运行
    let output = std::process::Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq ollama.exe"])
        .output()
        .map_err(|e| e.to_string())?;
    let output_str = String::from_utf8_lossy(&output.stdout);
    if output_str.lines().count() > 1 {
        info!("[Rust] Ollama already running, skipping spawn");
        return Ok(());
    }

    info!("[Rust] Starting Ollama sidecar...");
    let sidecar = app.shell().sidecar("ollama").map_err(|e| e.to_string())?;
    let (_rx, _child) = sidecar.spawn().map_err(|e| e.to_string())?;
    info!("[Rust] Ollama sidecar spawned successfully");
    Ok(())
}

#[tauri::command]
async fn stop_ollama() -> Result<(), String> {
    info!("[Rust] Stopping Ollama...");
    let output = std::process::Command::new("taskkill")
        .args(["/IM", "ollama.exe", "/F"])
        .output()
        .map_err(|e| e.to_string())?;
    info!("[Rust] Ollama stop result: {:?}", output.status);
    Ok(())
}
