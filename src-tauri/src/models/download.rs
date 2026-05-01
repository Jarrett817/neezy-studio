use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::commands::{register_downloaded_model, update_download_task};

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadOption {
    pub id: String,
    pub label: String,
    pub params_b: f32,
    pub quant: String,
    pub size_gb: f32,
    pub source: String,
    pub url: String,
    pub mirror_url: String,
    pub repo: String,
    pub note: String,
    pub capability: String,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadSuite {
    pub id: String,
    pub label: String,
    pub option_ids: Vec<String>,
    pub models: Vec<String>,
    pub note: String,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadTask {
    pub id: String,
    pub option_id: String,
    pub label: String,
    pub target_path: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub progress: f32,
    pub status: String,
    pub error_message: Option<String>,
}

pub fn model_download_options(endpoint: &str) -> Vec<ModelDownloadOption> {
    let endpoint = endpoint.trim_end_matches('/');
    [
        (
            "gemma4-e2b-q4",
            "Gemma 4 E2B IT Q4_K_M",
            2.3,
            "Q4_K_M",
            3.43,
            "lmstudio-community/gemma-4-E2B-it-GGUF",
            "gemma-4-E2B-it-Q4_K_M.gguf",
            "Gemma 4 lightweight text model for planning and review.",
            "text",
        ),
        (
            "gemma4-e4b-q4",
            "Gemma 4 E4B IT Q4_K_M",
            4.5,
            "Q4_K_M",
            5.34,
            "lmstudio-community/gemma-4-E4B-it-GGUF",
            "gemma-4-E4B-it-Q4_K_M.gguf",
            "Gemma 4 higher quality text model, recommended for 16GB+ RAM.",
            "text",
        ),
        (
            "qwen3-1.7b-q4",
            "Qwen3 1.7B Q4_0",
            1.7,
            "Q4_0",
            1.23,
            "QuantFactory/Qwen3-1.7B-GGUF",
            "Qwen3-1.7B.Q4_0.gguf",
            "Lightweight Chinese text model for low power drafting.",
            "text",
        ),
        (
            "qwen3-embedding-0.6b-q8",
            "Qwen3 Embedding 0.6B Q8_0",
            0.6,
            "Q8_0",
            0.64,
            "Qwen/Qwen3-Embedding-0.6B-GGUF",
            "Qwen3-Embedding-0.6B-Q8_0.gguf",
            "Embedding model for semantic memory and RAG.",
            "embedding",
        ),
        (
            "qwen3-4b-q4",
            "Qwen3 4B Q4_K_M",
            4.0,
            "Q4_K_M",
            2.6,
            "ggml-org/Qwen3-4B-GGUF",
            "Qwen3-4B-Q4_K_M.gguf",
            "Balanced Chinese text model for 16GB RAM machines.",
            "text",
        ),
        (
            "qwen3-8b-q4",
            "Qwen3 8B Q4_0",
            8.0,
            "Q4_0",
            4.45,
            "Antigma/Qwen3-8B-GGUF",
            "qwen3-8b-q4_0.gguf",
            "Higher quality text model; use only on high memory and low pressure.",
            "text",
        ),
        (
            "qwen2.5-vl-3b-q4",
            "Qwen2.5-VL 3B Instruct Q4_K_M",
            3.0,
            "Q4_K_M",
            2.2,
            "second-state/Qwen2.5-VL-3B-Instruct-GGUF",
            "Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf",
            "Vision model for image and cover understanding.",
            "vision",
        ),
        (
            "qwen2-vl-2b-q4",
            "Qwen2-VL 2B Instruct Q4_K_M",
            2.0,
            "Q4_K_M",
            1.6,
            "second-state/Qwen2-VL-2B-Instruct-GGUF",
            "Qwen2-VL-2B-Instruct-Q4_K_M.gguf",
            "Low power vision model.",
            "vision",
        ),
        (
            "qwen2.5-1.5b-q4",
            "Qwen2.5 1.5B Instruct Q4_K_M",
            1.5,
            "Q4_K_M",
            1.2,
            "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
            "qwen2.5-1.5b-instruct-q4_k_m.gguf",
            "Small text model for low memory machines.",
            "text",
        ),
        (
            "qwen2.5-3b-q4",
            "Qwen2.5 3B Instruct Q4_K_M",
            3.0,
            "Q4_K_M",
            2.2,
            "Qwen/Qwen2.5-3B-Instruct-GGUF",
            "qwen2.5-3b-instruct-q4_k_m.gguf",
            "General balanced text model.",
            "text",
        ),
        (
            "llama3.2-3b-q4",
            "Llama 3.2 3B Instruct Q4_K_M",
            3.0,
            "Q4_K_M",
            2.1,
            "bartowski/Llama-3.2-3B-Instruct-GGUF",
            "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
            "English-oriented fallback text model.",
            "text",
        ),
        (
            "qwen2.5-7b-q4",
            "Qwen2.5 7B Instruct Q4_K_M",
            7.0,
            "Q4_K_M",
            4.7,
            "Qwen/Qwen2.5-7B-Instruct-GGUF",
            "qwen2.5-7b-instruct-q4_k_m.gguf",
            "Higher quality text model for 16GB+ RAM and low pressure.",
            "text",
        ),
    ]
    .into_iter()
    .map(
        |(id, label, params_b, quant, size_gb, repo, file, note, capability)| {
            let path = format!("{repo}/resolve/main/{file}?download=true");
            ModelDownloadOption {
                id: id.to_string(),
                label: label.to_string(),
                params_b,
                quant: quant.to_string(),
                size_gb,
                source: "Hugging Face".to_string(),
                url: format!("https://huggingface.co/{path}"),
                mirror_url: format!("{endpoint}/{path}"),
                repo: repo.to_string(),
                note: note.to_string(),
                capability: capability.to_string(),
            }
        },
    )
    .collect()
}

pub fn tokenizer_repo_for_option(option: &ModelDownloadOption) -> Option<String> {
    if option.capability != "text" && option.capability != "vision" {
        return None;
    }

    if option.repo.contains("Qwen3") {
        if option.repo.contains("1.7B") {
            return Some("Qwen/Qwen3-1.7B".to_string());
        }
        if option.repo.contains("4B") {
            return Some("Qwen/Qwen3-4B".to_string());
        }
        if option.repo.contains("8B") {
            return Some("Qwen/Qwen3-8B".to_string());
        }
    }
    if option.id.starts_with("qwen2.5-1.5b") {
        return Some("Qwen/Qwen2.5-1.5B-Instruct".to_string());
    }
    if option.id.starts_with("qwen2.5-3b") {
        return Some("Qwen/Qwen2.5-3B-Instruct".to_string());
    }
    if option.id.starts_with("qwen2.5-7b") {
        return Some("Qwen/Qwen2.5-7B-Instruct".to_string());
    }
    if option.id.starts_with("gemma4-e2b") {
        return Some("google/gemma-4-E2B-it".to_string());
    }
    if option.id.starts_with("gemma4-e4b") {
        return Some("google/gemma-4-E4B-it".to_string());
    }
    if option.id.starts_with("llama3.2-3b") {
        return Some("meta-llama/Llama-3.2-3B-Instruct".to_string());
    }
    None
}

pub fn download_filename(option: &ModelDownloadOption) -> String {
    option
        .mirror_url
        .split('/')
        .next_back()
        .unwrap_or(&option.id)
        .split('?')
        .next()
        .unwrap_or(&option.id)
        .replace(
            |character: char| {
                !character.is_ascii_alphanumeric()
                    && character != '.'
                    && character != '-'
                    && character != '_'
            },
            "_",
        )
}

pub fn build_suite(
    id: &str,
    label: &str,
    option_ids: &[&str],
    note: &str,
    options: &[ModelDownloadOption],
) -> ModelDownloadSuite {
    ModelDownloadSuite {
        id: id.to_string(),
        label: label.to_string(),
        option_ids: option_ids.iter().map(|value| value.to_string()).collect(),
        models: option_ids
            .iter()
            .filter_map(|id| options.iter().find(|option| option.id == *id))
            .map(|option| option.label.clone())
            .collect(),
        note: note.to_string(),
    }
}

pub fn now_stamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    millis.to_string()
}

pub fn run_model_download(
    app: tauri::AppHandle,
    task_id: String,
    option: ModelDownloadOption,
    target_path: std::path::PathBuf,
) {
    use std::fs;

    let result = download_model_file(&option, &target_path, |downloaded, total| {
        update_download_task(&task_id, |task| {
            task.downloaded_bytes = downloaded;
            task.total_bytes = total;
            task.progress = total
                .map(|value| downloaded as f32 / value.max(1) as f32 * 100.0)
                .unwrap_or(0.0)
                .clamp(0.0, 99.0);
        });
    });

    match result {
        Ok(()) => {
            // Also download tokenizer.json if available
            if let Some(tokenizer_repo) = tokenizer_repo_for_option(&option) {
                if let Some(parent) = target_path.parent() {
                    let tokenizer_path = parent.join("tokenizer.json");
                    if !tokenizer_path.exists() {
                        log::info!("downloading tokenizer for {}", tokenizer_repo);
                        let _ = download_tokenizer(&tokenizer_repo, &tokenizer_path);
                    }
                }
            }

            update_download_task(&task_id, |task| {
                task.status = "done".to_string();
                task.progress = 100.0;
            });
            if let Err(error) = register_downloaded_model(&app, &option, &target_path) {
                update_download_task(&task_id, |task| {
                    task.status = "failed".to_string();
                    task.error_message = Some(error);
                });
            }
        }
        Err(error) => {
            let _ = fs::remove_file(&target_path);
            update_download_task(&task_id, |task| {
                task.status = "failed".to_string();
                task.error_message = Some(error);
            });
        }
    }
}

fn download_tokenizer(repo: &str, target_path: &std::path::Path) -> Result<(), String> {
    std::env::set_var("HF_ENDPOINT", "https://hf-mirror.com");
    let api = hf_hub::api::sync::Api::new().map_err(|e| e.to_string())?;
    let api = api.model(repo.to_string());
    let path = api.get("tokenizer.json").map_err(|e| e.to_string())?;
    std::fs::copy(&path, target_path).map_err(|e| e.to_string())?;
    Ok(())
}

fn download_model_file<F>(
    option: &ModelDownloadOption,
    target_path: &std::path::PathBuf,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(u64, Option<u64>),
{
    let urls = [option.mirror_url.as_str(), option.url.as_str()];
    let mut errors = Vec::new();

    for url in urls {
        match download_file(url, target_path, &mut on_progress) {
            Ok(()) => return Ok(()),
            Err(error) => {
                errors.push(format!("{url}: {error}"));
                let _ = std::fs::remove_file(target_path.with_extension("download"));
            }
        }
    }
    Err(format!(
        "model download failed; mirror and official source are unavailable: {}",
        errors.join("; ")
    ))
}

fn download_file<F>(
    url: &str,
    target_path: &std::path::PathBuf,
    on_progress: &mut F,
) -> Result<(), String>
where
    F: FnMut(u64, Option<u64>),
{
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(60 * 60 * 6))
        .user_agent("NeezyStudio/0.1 model-downloader")
        .build()
        .map_err(|error| error.to_string())?;
    let mut response = client.get(url).send().map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("download failed: HTTP {}", response.status()));
    }

    let total = response.content_length();
    let temp_path = target_path.with_extension("download");
    let mut file = std::fs::File::create(&temp_path).map_err(|error| error.to_string())?;

    std::io::copy(&mut response, &mut file).map_err(|error| error.to_string())?;

    let downloaded = temp_path
        .metadata()
        .map_err(|error| error.to_string())?
        .len();
    on_progress(downloaded, total);

    std::fs::rename(temp_path, target_path).map_err(|error| error.to_string())
}
