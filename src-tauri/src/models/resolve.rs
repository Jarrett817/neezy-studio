use std::fs;
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
    pub scanned_models: Vec<ModelConfig>,
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
            recommended_reason: "no model registered".to_string(),
            scanned_models: Vec::new(),
        }
    }
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
    #[serde(default = "default_text_capability")]
    pub capability: String,
    #[serde(default)]
    pub repo: Option<String>,
    #[serde(default)]
    pub file: Option<String>,
    #[serde(default)]
    pub tokenizer_repo: Option<String>,
}

fn default_text_capability() -> String {
    "text".to_string()
}

pub fn write_json<T: serde::Serialize + ?Sized>(path: &PathBuf, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let raw = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())
}

pub fn account_profile_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::storage::settings::app_data_dir(app)?.join("account-profile.json"))
}

pub fn import_jobs_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::storage::settings::app_data_dir(app)?.join("import-jobs.json"))
}

pub fn knowledge_items_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::storage::settings::app_data_dir(app)?.join("knowledge-items.json"))
}

pub fn skills_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::storage::settings::app_data_dir(app)?.join("skills.json"))
}

pub fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::storage::settings::app_data_dir(app)?.join("models"))
}

/// 扫描 models/ 目录下的所有 GGUF 文件（平铺），返回实时发现的模型列表
pub fn scan_models_dir(app: &AppHandle) -> Vec<ModelConfig> {
    let models_path = match models_dir(app) {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };

    if !models_path.is_dir() {
        return Vec::new();
    }

    let mut models = Vec::new();

    // 递归扫描所有 .gguf 文件
    fn scanRecursive(dir: &Path, models_path: &Path, models: &mut Vec<ModelConfig>) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    scanRecursive(&path, models_path, models);
                } else if path.extension().map(|e| e == "gguf").unwrap_or(false) {
                    let file_name = path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    // 使用相对于 models 目录的路径作为 ID
                    let relative_path = path.strip_prefix(models_path)
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|_| file_name.clone());
                    let id = relative_path.replace(['/', '\\'], "_").replace(".gguf", "");

                    let size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                    let size_gb = size_bytes as f32 / (1024.0 * 1024.0 * 1024.0);

                    let capability = infer_capability_from_filename(&file_name);
                    let params_b = infer_params_from_path(&file_name);
                    let quant = infer_quant_from_filename(&file_name);

                    models.push(ModelConfig {
                        id: id.clone(),
                        label: file_name.clone(),
                        path: path.to_string_lossy().to_string(),
                        params_b,
                        quant,
                        size_gb,
                        enabled: true,
                        capability,
                        repo: None,
                        file: Some(file_name),
                        tokenizer_repo: None,
                    });
                }
            }
        }
    }

    scanRecursive(&models_path, &models_path, &mut models);

    models
}

fn infer_capability_from_filename(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("embedding") || lower.contains("embed") {
        "embedding".to_string()
    } else if lower.contains("vision") || lower.contains("vl") || lower.contains("qwen2.5-vl") {
        "vision".to_string()
    } else {
        "text".to_string()
    }
}

fn infer_quant_from_filename(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("q8") || lower.contains("q0") {
        "Q8_0".to_string()
    } else if lower.contains("q6") {
        "Q6_K".to_string()
    } else if lower.contains("q5") {
        "Q5_K_M".to_string()
    } else if lower.contains("q4") {
        if lower.contains("q4_k_m") || lower.contains("q4km") {
            "Q4_K_M".to_string()
        } else if lower.contains("q4_0") {
            "Q4_0".to_string()
        } else {
            "Q4_K_M".to_string()
        }
    } else if lower.contains("q3") {
        "Q3_K_M".to_string()
    } else if lower.contains("q2") {
        "Q2_K".to_string()
    } else {
        "unknown".to_string()
    }
}

pub fn skill_packages_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::storage::settings::app_data_dir(app)?.join("skill-packages"))
}

pub fn resolve_llm_model(
    settings: &crate::storage::settings::RuntimeSettings,
    metrics: &RuntimeMetrics,
    model_id: Option<&str>,
    model_path: Option<&str>,
) -> Result<ModelConfig, String> {
    if let Some(path) = model_path.map(str::trim).filter(|value| !value.is_empty()) {
        return Ok(ModelConfig {
            id: model_id.unwrap_or("manual").to_string(),
            label: "Manual model".to_string(),
            path: path.to_string(),
            params_b: infer_params_from_path(path),
            quant: "unknown".to_string(),
            size_gb: 0.0,
            enabled: true,
            capability: "text".to_string(),
            repo: None,
            file: PathBuf::from(path)
                .file_name()
                .map(|value| value.to_string_lossy().to_string()),
            tokenizer_repo: None,
        });
    }

    let selected = model_id
        .and_then(|id| settings.models.iter().find(|model| model.id == id))
        .or_else(|| {
            metrics
                .recommended_model_id
                .as_deref()
                .and_then(|id| settings.models.iter().find(|model| model.id == id))
        })
        .or_else(|| recommend_model(settings, &metrics.pressure, metrics.available_memory_gb))
        .ok_or_else(|| {
            "no available text model; download or register a GGUF model first".to_string()
        })?;

    Ok(selected.clone())
}

pub fn recommend_model<'a>(
    settings: &'a crate::storage::settings::RuntimeSettings,
    pressure: &str,
    available_memory_gb: f32,
) -> Option<&'a ModelConfig> {
    let limit = if pressure == "high" || settings.prefer_low_power || available_memory_gb < 8.0 {
        3.0
    } else if available_memory_gb < 14.0 {
        4.0
    } else {
        7.0
    };

    settings
        .models
        .iter()
        .filter(|model| {
            model.enabled
                && model.capability == "text"
                && model.params_b <= limit
                && PathBuf::from(&model.path).is_file()
        })
        .max_by(|a, b| a.params_b.total_cmp(&b.params_b))
        .or_else(|| {
            settings
                .models
                .iter()
                .filter(|model| {
                    model.enabled
                        && model.capability == "text"
                        && PathBuf::from(&model.path).is_file()
                })
                .min_by(|a, b| a.params_b.total_cmp(&b.params_b))
        })
}

/// 基于扫描得到的模型列表进行推荐（用于实时扫描场景）
pub fn recommend_from_scanned<'a>(
    scanned: &'a [ModelConfig],
    pressure: &str,
    available_memory_gb: f32,
) -> Option<&'a ModelConfig> {
    let limit = if pressure == "high" || available_memory_gb < 8.0 {
        3.0
    } else if available_memory_gb < 14.0 {
        4.0
    } else {
        7.0
    };

    scanned
        .iter()
        .filter(|model| {
            model.enabled
                && model.capability == "text"
                && model.params_b <= limit
                && PathBuf::from(&model.path).is_file()
        })
        .max_by(|a, b| a.params_b.total_cmp(&b.params_b))
        .or_else(|| {
            scanned
                .iter()
                .filter(|model| {
                    model.enabled
                        && model.capability == "text"
                        && PathBuf::from(&model.path).is_file()
                })
                .min_by(|a, b| a.params_b.total_cmp(&b.params_b))
        })
}

pub fn infer_params_from_path(path: &str) -> f32 {
    let lower = path.to_lowercase();
    if lower.contains("7b") {
        7.0
    } else if lower.contains("3b") {
        3.0
    } else if lower.contains("1.5b") || lower.contains("1_5b") {
        1.5
    } else {
        0.0
    }
}

pub fn now_stamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    millis.to_string()
}
