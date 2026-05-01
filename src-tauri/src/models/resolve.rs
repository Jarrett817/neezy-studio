use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMetrics {
    pub cpu_count: usize,
    pub cpu_usage_percent: f32,
    pub total_memory_gb: f32,
    pub available_memory_gb: f32,
    pub pressure: String,
    pub recommended_model_id: Option<String>,
    pub recommended_reason: String,
}

impl Default for RuntimeMetrics {
    fn default() -> Self {
        Self {
            cpu_count: 1,
            cpu_usage_percent: 0.0,
            total_memory_gb: 0.0,
            available_memory_gb: 0.0,
            pressure: "medium".to_string(),
            recommended_model_id: None,
            recommended_reason: "使用 Ollama 模型".to_string(),
        }
    }
}

pub fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::storage::settings::app_data_dir(app)?.join("models"))
}

pub fn scan_models_dir(app: &AppHandle) -> Vec<ModelConfig> {
    let models_path = match models_dir(app) {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };
    if !models_path.is_dir() {
        return Vec::new();
    }
    let mut models = Vec::new();
    scan_recursive(&models_path, &models_path, &mut models);
    models
}

fn scan_recursive(dir: &Path, models_path: &Path, models: &mut Vec<ModelConfig>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                scan_recursive(&path, models_path, models);
            } else if path.extension().map(|e| e == "gguf").unwrap_or(false) {
                let file_name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                let size_bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                let size_gb = size_bytes as f32 / (1024.0 * 1024.0 * 1024.0);
                let relative_path = path.strip_prefix(models_path).map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|_| file_name.clone());
                let id = relative_path.replace(['/', '\\'], "_").replace(".gguf", "");
                models.push(ModelConfig {
                    id,
                    label: file_name,
                    path: path.to_string_lossy().to_string(),
                    params_b: infer_params_from_path(&file_name),
                    quant: infer_quant_from_filename(&file_name),
                    size_gb,
                    enabled: true,
                    capability: infer_capability_from_filename(&file_name),
                });
            }
        }
    }
}

fn infer_capability_from_filename(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("embedding") || lower.contains("embed") {
        "embedding".to_string()
    } else if lower.contains("vision") || lower.contains("vl") {
        "vision".to_string()
    } else {
        "text".to_string()
    }
}

fn infer_quant_from_filename(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("q8") || lower.contains("q0") { "Q8_0".to_string() }
    else if lower.contains("q6") { "Q6_K".to_string() }
    else if lower.contains("q5") { "Q5_K_M".to_string() }
    else if lower.contains("q4") {
        if lower.contains("q4_k_m") { "Q4_K_M".to_string() }
        else if lower.contains("q4_0") { "Q4_0".to_string() }
        else { "Q4_K_M".to_string() }
    }
    else if lower.contains("q3") { "Q3_K_M".to_string() }
    else if lower.contains("q2") { "Q2_K".to_string() }
    else { "unknown".to_string() }
}

fn infer_params_from_path(path: &str) -> f32 {
    let lower = path.to_lowercase();
    if lower.contains("7b") { 7.0 }
    else if lower.contains("3b") { 3.0 }
    else if lower.contains("1.5b") || lower.contains("1_5b") { 1.5 }
    else { 0.0 }
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfig {
    pub id: String,
    pub label: String,
    pub path: String,
    pub params_b: f32,
    pub quant: String,
    pub size_gb: f32,
    pub enabled: bool,
    pub capability: String,
}

pub fn recommend_from_scanned<'a>(scanned: &'a [ModelConfig], pressure: &str, available_memory_gb: f32) -> Option<&'a ModelConfig> {
    let limit = if pressure == "high" || available_memory_gb < 8.0 { 3.0 }
    else if available_memory_gb < 14.0 { 4.0 }
    else { 7.0 };
    scanned.iter()
        .filter(|model| model.enabled && model.capability == "text" && model.params_b <= limit && PathBuf::from(&model.path).is_file())
        .max_by(|a, b| a.params_b.total_cmp(&b.params_b))
        .or_else(|| scanned.iter().filter(|model| model.enabled && model.capability == "text" && PathBuf::from(&model.path).is_file()).min_by(|a, b| a.params_b.total_cmp(&b.params_b)))
}

use std::path::PathBuf;