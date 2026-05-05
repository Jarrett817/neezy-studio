pub mod commands;
mod system;

pub use commands::get_runtime_metrics;
pub use system::{build_runtime_metrics, RuntimeMetrics};

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
