// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use log::info;
use tauri::Manager;

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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime_metrics,
            get_resource_path,
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