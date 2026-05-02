use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSettings {
    pub prefer_low_power: bool,
    pub max_cpu_percent: u8,
    #[serde(default = "default_ollama_model")]
    pub ollama_model: String,
}

fn default_ollama_model() -> String {
    "qwen3:1.7b".to_string()
}

impl Default for RuntimeSettings {
    fn default() -> Self {
        Self {
            prefer_low_power: true,
            max_cpu_percent: 95,
            ollama_model: "qwen3:1.7b".to_string(),
        }
    }
}

pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

pub fn runtime_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("runtime-settings.json"))
}

pub fn read_runtime_settings(app: &AppHandle) -> Result<RuntimeSettings, String> {
    let path = runtime_settings_path(app)?;
    if !path.is_file() {
        return Ok(RuntimeSettings::default());
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

pub fn write_runtime_settings(app: &AppHandle, settings: &RuntimeSettings) -> Result<(), String> {
    if let Some(parent) = runtime_settings_path(app)?.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let raw = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(runtime_settings_path(app)?, raw).map_err(|error| error.to_string())
}

