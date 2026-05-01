// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agent;
mod llm;
mod models;
mod storage;

mod commands;
mod system;
mod types;

pub use commands::{
    add_knowledge_item, add_memory_event, cancel_generation, create_import_job,
    delete_knowledge_item, delete_skill, ensure_ollama_running, get_account_profile, get_build_info,
    get_model_status, get_ollama_host, get_relevant_knowledge, get_runtime_metrics,
    get_runtime_settings, get_workspace_snapshot, import_local_model, import_skill_archive, import_skill_folder,
    is_ollama_running, list_import_jobs, list_knowledge_items, list_skills, retry_import_job, run_import_job,
    save_account_profile, save_knowledge_item, save_pasted_image, save_runtime_settings,
    save_skill, set_skill_enabled,
    stop_ollama,
};
pub use models::resolve::RuntimeMetrics;
pub use system::{build_runtime_metrics, runtime_plan};
pub use types::{
    BuildInfo, ContentAgentInput, DashboardSummary, DraftPreview, ExtractedImport,
    ImportJob, JobStage, KnowledgePreview, LlmMessage, MemoryEventInput,
    MetricPoint, SavePastedImageInput, SkillImportFile, WorkspaceSnapshot,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_build_info,
            get_workspace_snapshot,
            get_account_profile,
            save_account_profile,
            get_runtime_settings,
            save_runtime_settings,
            get_runtime_metrics,
            get_model_status,
            import_local_model,
            get_relevant_knowledge,
            list_knowledge_items,
            save_knowledge_item,
            delete_knowledge_item,
            list_skills,
            save_skill,
            set_skill_enabled,
            import_skill_archive,
            import_skill_folder,
            delete_skill,
            add_memory_event,
            cancel_generation,
            add_knowledge_item,
            save_pasted_image,
            list_import_jobs,
            create_import_job,
            run_import_job,
            retry_import_job,
            ensure_ollama_running,
            is_ollama_running,
            get_ollama_host,
            stop_ollama
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}