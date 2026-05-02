// Ollama 进程管理
use crate::llm;
use crate::BuildInfo;
use crate::RuntimeMetrics;
use crate::storage::settings::RuntimeSettings;
use tauri::AppHandle;

#[tauri::command]
pub fn get_build_info() -> BuildInfo {
    BuildInfo::new()
}

#[tauri::command]
pub async fn ensure_ollama_running(app: AppHandle) -> Result<(), String> {
    llm::ensure_ollama_running(&app).await
}

#[tauri::command]
pub fn is_ollama_running() -> bool {
    llm::is_server_running()
}

#[tauri::command]
pub fn stop_ollama() {
    llm::stop_ollama()
}

#[tauri::command]
pub fn get_ollama_host() -> &'static str {
    llm::get_ollama_host()
}

// 运行时设置
#[tauri::command]
pub fn get_runtime_settings(app: AppHandle) -> Result<RuntimeSettings, String> {
    crate::storage::settings::read_runtime_settings(&app)
}

#[tauri::command]
pub fn save_runtime_settings(app: AppHandle, settings: RuntimeSettings) -> Result<RuntimeSettings, String> {
    crate::storage::settings::write_runtime_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn get_runtime_metrics(app: AppHandle) -> Result<RuntimeMetrics, String> {
    Ok(crate::system::build_runtime_metrics(&app))
}

// 占位实现 - 前端兼容
#[tauri::command]
pub fn get_workspace_snapshot() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "summary": {
            "draftCount": 0,
            "readyToPublishCount": 0,
            "knowledgeCount": 0,
            "weeklyPostCount": 0
        },
        "drafts": [],
        "knowledge": []
    }))
}

#[tauri::command]
pub fn get_account_profile() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "accountName": "",
        "track": "",
        "persona": "",
        "toneStyle": "",
        "forbiddenWords": ""
    }))
}

#[tauri::command]
pub fn save_account_profile(_profile: serde_json::Value) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({}))
}

#[tauri::command]
pub fn get_relevant_knowledge(_input: serde_json::Value) -> Vec<serde_json::Value> {
    Vec::new()
}

#[tauri::command]
pub fn list_knowledge_items() -> Vec<serde_json::Value> {
    Vec::new()
}

#[tauri::command]
pub fn save_knowledge_item(_item: serde_json::Value) -> serde_json::Value {
    serde_json::json!({})
}

#[tauri::command]
pub fn delete_knowledge_item(_id: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn list_skills() -> Vec<serde_json::Value> {
    Vec::new()
}

#[tauri::command]
pub fn save_skill(_skill: serde_json::Value) -> serde_json::Value {
    serde_json::json!({})
}

#[tauri::command]
pub fn set_skill_enabled(_id: String, _enabled: bool) -> serde_json::Value {
    serde_json::json!({})
}

#[tauri::command]
pub fn delete_skill(_id: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn import_skill_archive(_input: serde_json::Value) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({}))
}

#[tauri::command]
pub fn import_skill_folder(_input: serde_json::Value) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({}))
}

#[tauri::command]
pub fn add_memory_event(_input: serde_json::Value) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn save_pasted_image(_input: serde_json::Value) -> String {
    String::new()
}