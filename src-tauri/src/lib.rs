pub mod llm;
pub mod storage;
pub mod commands;
mod system;

pub use system::{build_runtime_metrics, RuntimeMetrics};
pub use commands::{get_build_info, ensure_ollama_running, is_ollama_running, stop_ollama, get_ollama_host, get_runtime_settings, save_runtime_settings, get_runtime_metrics, get_workspace_snapshot, get_account_profile, save_account_profile, get_relevant_knowledge, list_knowledge_items, save_knowledge_item, delete_knowledge_item, list_skills, save_skill, set_skill_enabled, delete_skill, add_memory_event, save_pasted_image};

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildInfo {
    pub app_name: String,
    pub app_version: String,
    pub target: String,
    pub profile: String,
}

impl BuildInfo {
    pub fn new() -> Self {
        BuildInfo {
            app_name: "Neezy Studio".to_string(),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            target: std::env::consts::OS.to_string(),
            profile: if cfg!(debug_assertions) {
                "debug".to_string()
            } else {
                "release".to_string()
            },
        }
    }
}

impl Default for BuildInfo {
    fn default() -> Self {
        Self::new()
    }
}