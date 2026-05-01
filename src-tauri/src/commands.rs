use crate::agent::memory::{KnowledgeItem, get_relevant_knowledge};
use crate::agent::skill::AgentSkill;
use crate::llm;
use crate::models;
use crate::storage::db::AccountProfile;
use crate::storage::settings::RuntimeSettings;
use crate::types::*;
use rusqlite::params;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

#[tauri::command]
fn get_build_info() -> BuildInfo { BuildInfo::new() }

#[tauri::command]
fn get_workspace_snapshot(app: AppHandle) -> Result<WorkspaceSnapshot, String> {
    let items = crate::agent::memory::read_knowledge_items(&app)?;
    let knowledge: Vec<KnowledgePreview> = items.into_iter().map(|item| KnowledgePreview {
        id: item.id.unwrap_or_else(|| item.title.clone()),
        title: item.title,
        category: item.category,
        content: item.content,
        last_used_at: "unused".to_string(),
    }).collect();
    Ok(WorkspaceSnapshot::new(knowledge.len() as u32))
}

#[tauri::command]
fn get_account_profile(app: AppHandle) -> Result<AccountProfile, String> {
    crate::storage::db::read_account_profile(&app)
}

#[tauri::command]
fn save_account_profile(app: AppHandle, profile: AccountProfile) -> Result<AccountProfile, String> {
    crate::storage::db::write_account_profile(&app, &profile)?;
    Ok(profile)
}

#[tauri::command]
fn get_runtime_settings(app: AppHandle) -> Result<RuntimeSettings, String> {
    crate::storage::settings::read_runtime_settings(&app)
}

#[tauri::command]
fn save_runtime_settings(app: AppHandle, settings: RuntimeSettings) -> Result<RuntimeSettings, String> {
    crate::storage::settings::write_runtime_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn get_runtime_metrics(app: AppHandle) -> Result<crate::RuntimeMetrics, String> {
    let settings = crate::storage::settings::read_runtime_settings(&app)?;
    Ok(crate::system::build_runtime_metrics(&settings, &app))
}

#[tauri::command]
async fn get_relevant_knowledge_cmd(app: AppHandle, input: ContentAgentInput) -> Result<Vec<KnowledgePreview>, String> {
    let items = get_relevant_knowledge(&app, &input.topic, &input.goal, &input.references).await?;
    Ok(items.into_iter().map(|entry| KnowledgePreview {
        id: entry.id.unwrap_or_default(),
        title: entry.title,
        category: entry.category,
        content: entry.content,
        last_used_at: "score".to_string(),
    }).collect())
}

#[tauri::command]
fn list_knowledge_items(app: AppHandle) -> Result<Vec<KnowledgeItem>, String> {
    crate::agent::memory::read_knowledge_items(&app)
}

#[tauri::command]
fn save_knowledge_item(app: AppHandle, item: KnowledgeItem) -> Result<KnowledgeItem, String> {
    crate::agent::memory::upsert_knowledge_item(&app, &item)?;
    Ok(item)
}

#[tauri::command]
fn delete_knowledge_item(app: AppHandle, id: String) -> Result<(), String> {
    let conn = crate::storage::db::open_memory_db(&app)?;
    conn.execute("delete from knowledge_items where id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_skills(app: AppHandle) -> Result<Vec<AgentSkill>, String> {
    crate::agent::skill::read_skills(&app).map(|skills| skills.into_iter().map(crate::agent::skill::normalize_skill).collect())
}

#[tauri::command]
fn save_skill(app: AppHandle, skill: AgentSkill) -> Result<AgentSkill, String> {
    let mut skills = crate::agent::skill::read_skills(&app)?;
    let normalized = crate::agent::skill::normalize_skill(skill);
    if let Some(existing) = skills.iter_mut().find(|item| item.id == normalized.id) {
        *existing = normalized.clone();
    } else {
        skills.push(normalized.clone());
    }
    crate::agent::skill::write_skills(&app, &skills)?;
    Ok(normalized)
}

#[tauri::command]
fn set_skill_enabled(app: AppHandle, id: String, enabled: bool) -> Result<AgentSkill, String> {
    let mut skills = crate::agent::skill::read_skills(&app)?;
    let skill = skills.iter_mut().find(|item| item.id == id).ok_or_else(|| "skill not found".to_string())?;
    skill.enabled = enabled;
    skill.updated_at = Some(crate::models::resolve::now_stamp());
    let normalized = crate::agent::skill::normalize_skill(skill.clone());
    *skill = normalized.clone();
    crate::agent::skill::write_skills(&app, &skills)?;
    Ok(normalized)
}

#[tauri::command]
fn delete_skill(app: AppHandle, id: String) -> Result<(), String> {
    let mut skills = crate::agent::skill::read_skills(&app)?;
    if let Some(skill) = skills.iter().find(|skill| skill.id == id) {
        if let Some(root_path) = &skill.root_path {
            let path = PathBuf::from(root_path);
            if path.is_dir() {
                let _ = fs::remove_dir_all(path);
            }
        }
    }
    skills.retain(|skill| skill.id != id);
    crate::agent::skill::write_skills(&app, &skills)
}

#[tauri::command]
fn add_memory_event(app: AppHandle, input: MemoryEventInput) -> Result<(), String> {
    let conn = crate::storage::db::open_memory_db(&app)?;
    conn.execute(
        "insert into memory_events (id, layer, content, source, created_at) values (?1, ?2, ?3, ?4, ?5)",
        params![format!("memory-{}", crate::models::resolve::now_stamp()), input.layer, input.content, input.source, crate::models::resolve::now_stamp()],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn cancel_generation() { llm::cancel_generation(); }

#[tauri::command]
fn save_pasted_image(app: AppHandle, input: SavePastedImageInput) -> Result<String, String> {
    let bytes = decode_base64(&input.bytes_base64)?;
    let dir = crate::storage::settings::app_data_dir(&app)?.join("pasted-images");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let ext = match input.mime_type.as_str() {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "png",
    };
    let file_name = input.file_name.as_deref().filter(|n| !n.is_empty()).unwrap_or(&crate::models::resolve::now_stamp());
    let path = dir.join(format!("{}.{}", file_name, ext));
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn decode_base64(value: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.decode(value).map_err(|e| e.to_string())
}

// Ollama commands

#[tauri::command]
async fn ensure_ollama_running(app: AppHandle) -> Result<(), String> {
    llm::ensure_ollama_running(&app)
}

#[tauri::command]
fn is_ollama_running() -> bool {
    llm::is_server_running()
}

#[tauri::command]
fn stop_ollama() {
    llm::stop_ollama()
}

#[tauri::command]
fn get_ollama_host() -> &'static str {
    llm::get_ollama_host()
}