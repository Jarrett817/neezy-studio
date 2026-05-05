use crate::BuildInfo;

#[tauri::command]
pub fn get_build_info() -> BuildInfo {
    BuildInfo::new()
}

#[tauri::command]
pub fn get_runtime_metrics(app: tauri::AppHandle) -> Result<crate::RuntimeMetrics, String> {
    Ok(crate::system::build_runtime_metrics(&app))
}
