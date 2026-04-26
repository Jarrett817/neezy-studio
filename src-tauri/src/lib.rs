use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    net::TcpStream,
    path::PathBuf,
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildInfo {
    app_name: String,
    app_version: String,
    target: String,
    profile: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalModelOption {
    id: String,
    ollama_model: String,
    name: String,
    size_label: String,
    min_memory_label: String,
    quantization: String,
    summary: String,
    downloaded: bool,
    provider: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelRuntimeState {
    active_model_id: Option<String>,
    allow_auto_download: bool,
    ollama_available: bool,
    ollama_install_url: String,
    models: Vec<LocalModelOption>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelRuntimeConfig {
    active_model_id: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AccountProfile {
    account_name: String,
    track: String,
    persona: String,
    tone_style: String,
    forbidden_words: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DashboardSummary {
    draft_count: u32,
    ready_to_publish_count: u32,
    knowledge_count: u32,
    weekly_post_count: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSnapshot {
    summary: DashboardSummary,
    drafts: Vec<DraftPreview>,
    knowledge: Vec<KnowledgePreview>,
    metrics: Vec<MetricPoint>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DraftPreview {
    id: String,
    title: String,
    status: String,
    updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgePreview {
    id: String,
    title: String,
    category: String,
    last_used_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MetricPoint {
    label: String,
    views: u32,
    saves: u32,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportJob {
    id: String,
    source_url: String,
    stage: JobStage,
    created_at: String,
    updated_at: String,
    note_id: String,
    insight: Option<String>,
    extracted: Option<ExtractedImport>,
    error_message: Option<String>,
}

#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
enum JobStage {
    Queued,
    Screenshot,
    Extract,
    Understand,
    Done,
    Failed,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractedImport {
    author: String,
    title: String,
    likes: u32,
    saves: u32,
}

#[tauri::command]
fn get_build_info() -> BuildInfo {
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

#[tauri::command]
fn get_workspace_snapshot() -> WorkspaceSnapshot {
    WorkspaceSnapshot {
        summary: DashboardSummary {
            draft_count: 0,
            ready_to_publish_count: 0,
            knowledge_count: 0,
            weekly_post_count: 0,
        },
        drafts: Vec::new(),
        knowledge: Vec::new(),
        metrics: Vec::new(),
    }
}

#[tauri::command]
fn get_account_profile(app: AppHandle) -> Result<AccountProfile, String> {
    read_account_profile(&app)
}

#[tauri::command]
fn save_account_profile(app: AppHandle, profile: AccountProfile) -> Result<AccountProfile, String> {
    write_account_profile(&app, &profile)?;
    Ok(profile)
}

#[tauri::command]
fn get_model_runtime_state(app: AppHandle) -> Result<ModelRuntimeState, String> {
    build_model_runtime_state(&app)
}

#[tauri::command]
fn install_ollama() -> Result<String, String> {
    let url = ollama_install_url();
    open_external_url(&url)?;
    Ok(format!("Installer opened: {url}"))
}

#[tauri::command]
fn download_model(app: AppHandle, model_id: String) -> Result<ModelRuntimeState, String> {
    let spec = model_spec(&model_id).ok_or_else(|| "Model does not exist".to_string())?;
    pull_ollama_model(spec.ollama_model)?;
    build_model_runtime_state(&app)
}

#[tauri::command]
fn set_active_model(app: AppHandle, model_id: String) -> Result<ModelRuntimeState, String> {
    model_spec(&model_id).ok_or_else(|| "Model does not exist".to_string())?;

    let state = build_model_runtime_state(&app)?;
    let model = state
        .models
        .iter()
        .find(|item| item.id == model_id)
        .ok_or_else(|| "Model does not exist".to_string())?;

    if !model.downloaded {
        return Err("This model is not ready yet. Download it first.".to_string());
    }

    write_model_config(
        &app,
        &ModelRuntimeConfig {
            active_model_id: Some(model_id),
        },
    )?;

    build_model_runtime_state(&app)
}

#[tauri::command]
fn list_import_jobs(app: AppHandle) -> Result<Vec<ImportJob>, String> {
    let mut jobs = read_import_jobs(&app)?;
    jobs.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(jobs)
}

#[tauri::command]
fn create_import_job(app: AppHandle, source_url: String) -> Result<ImportJob, String> {
    let note_id =
        parse_note_id(&source_url).ok_or_else(|| "Invalid xiaohongshu article URL.".to_string())?;
    let now = now_stamp();

    let job = ImportJob {
        id: format!("import-{}", now),
        source_url,
        stage: JobStage::Queued,
        created_at: now.clone(),
        updated_at: now,
        note_id,
        insight: None,
        extracted: None,
        error_message: None,
    };

    let mut jobs = read_import_jobs(&app)?;
    jobs.insert(0, job.clone());
    write_import_jobs(&app, &jobs)?;
    Ok(job)
}

#[tauri::command]
fn run_import_job(app: AppHandle, job_id: String) -> Result<ImportJob, String> {
    let mut jobs = read_import_jobs(&app)?;
    let target = jobs
        .iter_mut()
        .find(|item| item.id == job_id)
        .ok_or_else(|| "Import job does not exist".to_string())?;

    target.stage = JobStage::Failed;
    target.updated_at = now_stamp();
    target.error_message = Some(
        "Real capture backend is not configured: no crawler, OCR pipeline, or model runner exists."
            .to_string(),
    );

    let failed_job = target.clone();
    write_import_jobs(&app, &jobs)?;
    Err(failed_job
        .error_message
        .clone()
        .unwrap_or_else(|| "Import job failed".to_string()))
}

#[tauri::command]
fn retry_import_job(app: AppHandle, job_id: String) -> Result<ImportJob, String> {
    let mut jobs = read_import_jobs(&app)?;
    let target = jobs
        .iter_mut()
        .find(|item| item.id == job_id)
        .ok_or_else(|| "Import job does not exist".to_string())?;

    target.stage = JobStage::Queued;
    target.updated_at = now_stamp();
    target.error_message = None;
    let job = target.clone();
    write_import_jobs(&app, &jobs)?;
    Ok(job)
}

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
            get_model_runtime_state,
            install_ollama,
            download_model,
            set_active_model,
            list_import_jobs,
            create_import_job,
            run_import_job,
            retry_import_job
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn build_model_runtime_state(app: &AppHandle) -> Result<ModelRuntimeState, String> {
    let config = read_model_config(app)?;
    let ollama_models = list_ollama_models().unwrap_or_default();
    let ollama_available = !ollama_models.is_empty() || ollama_healthcheck();
    let mut models = model_catalog(&ollama_models)?;
    let configured_active_model_id = config.active_model_id.clone();
    let active_model_id = configured_active_model_id
        .clone()
        .filter(|id| models.iter().any(|item| item.id == *id && item.downloaded));

    if configured_active_model_id != active_model_id {
        write_model_config(
            app,
            &ModelRuntimeConfig {
                active_model_id: active_model_id.clone(),
            },
        )?;
    }

    models.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(ModelRuntimeState {
        active_model_id,
        allow_auto_download: true,
        ollama_available,
        ollama_install_url: ollama_install_url(),
        models,
    })
}

fn model_catalog(ollama_models: &[String]) -> Result<Vec<LocalModelOption>, String> {
    Ok(model_specs()
        .iter()
        .map(|spec| {
            let downloaded = ollama_models.iter().any(|name| {
                name == spec.ollama_model || name.starts_with(&format!("{}:", spec.ollama_model))
            });
            let provider = if downloaded { "ollama" } else { "missing" };

            LocalModelOption {
                id: spec.id.to_string(),
                ollama_model: spec.ollama_model.to_string(),
                name: spec.name.to_string(),
                size_label: spec.size_label.to_string(),
                min_memory_label: spec.min_memory_label.to_string(),
                quantization: spec.quantization.to_string(),
                summary: spec.summary.to_string(),
                downloaded,
                provider: provider.to_string(),
            }
        })
        .collect())
}

fn read_model_config(app: &AppHandle) -> Result<ModelRuntimeConfig, String> {
    let path = model_config_path(app)?;

    if !path.is_file() {
        return Ok(ModelRuntimeConfig::default());
    }

    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

fn write_model_config(app: &AppHandle, config: &ModelRuntimeConfig) -> Result<(), String> {
    write_json(&model_config_path(app)?, config)
}

fn read_account_profile(app: &AppHandle) -> Result<AccountProfile, String> {
    let path = account_profile_path(app)?;

    if !path.is_file() {
        return Ok(AccountProfile {
            account_name: String::new(),
            track: String::new(),
            persona: String::new(),
            tone_style: String::new(),
            forbidden_words: String::new(),
        });
    }

    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

fn write_account_profile(app: &AppHandle, profile: &AccountProfile) -> Result<(), String> {
    write_json(&account_profile_path(app)?, profile)
}

struct ModelSpec {
    id: &'static str,
    ollama_model: &'static str,
    name: &'static str,
    size_label: &'static str,
    min_memory_label: &'static str,
    quantization: &'static str,
    summary: &'static str,
}

fn model_specs() -> [ModelSpec; 3] {
    [
        ModelSpec {
            id: "gemma4-e2b",
            ollama_model: "gemma4:e2b",
            name: "Gemma 4 E2B",
            size_label: "~3.2GB memory",
            min_memory_label: "8GB memory",
            quantization: "Ollama managed",
            summary: "Default local model for edge and desktop use.",
        },
        ModelSpec {
            id: "gemma4-e4b",
            ollama_model: "gemma4:e4b",
            name: "Gemma 4 E4B",
            size_label: "~5GB memory",
            min_memory_label: "12GB memory",
            quantization: "Ollama managed",
            summary: "Higher quality Gemma option managed by Ollama.",
        },
        ModelSpec {
            id: "qwen2.5-3b",
            ollama_model: "qwen2.5:3b",
            name: "Qwen2.5 3B",
            size_label: "Ollama managed",
            min_memory_label: "8GB memory",
            quantization: "Ollama managed",
            summary: "Chinese writing option managed by Ollama.",
        },
    ]
}

fn model_spec(model_id: &str) -> Option<ModelSpec> {
    model_specs().into_iter().find(|spec| spec.id == model_id)
}

fn ollama_healthcheck() -> bool {
    ollama_request("GET", "/api/tags", None, Duration::from_secs(2)).is_ok()
}

fn ollama_install_url() -> String {
    if cfg!(target_os = "windows") {
        "https://ollama.com/download/OllamaSetup.exe".to_string()
    } else if cfg!(target_os = "macos") {
        "https://ollama.com/download/Ollama-darwin.zip".to_string()
    } else {
        "https://ollama.com/download".to_string()
    }
}

fn open_external_url(url: &str) -> Result<(), String> {
    let mut command = if cfg!(target_os = "windows") {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "start", "", url]);
        cmd
    } else if cfg!(target_os = "macos") {
        let mut cmd = Command::new("open");
        cmd.arg(url);
        cmd
    } else {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(url);
        cmd
    };

    command.spawn().map_err(|error| error.to_string())?;
    Ok(())
}

fn list_ollama_models() -> Result<Vec<String>, String> {
    let body = ollama_request("GET", "/api/tags", None, Duration::from_secs(3))?;
    let parsed: serde_json::Value =
        serde_json::from_str(&body).map_err(|error| error.to_string())?;
    let models = parsed
        .get("models")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("name").and_then(|name| name.as_str()))
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(models)
}

fn pull_ollama_model(model_name: &str) -> Result<(), String> {
    let body = serde_json::json!({
        "name": model_name,
        "stream": false
    })
    .to_string();
    let response = ollama_request(
        "POST",
        "/api/pull",
        Some(&body),
        Duration::from_secs(60 * 60),
    )?;
    let parsed: serde_json::Value =
        serde_json::from_str(&response).map_err(|error| error.to_string())?;

    if let Some(error) = parsed.get("error").and_then(|value| value.as_str()) {
        return Err(error.to_string());
    }

    Ok(())
}

fn ollama_request(
    method: &str,
    path: &str,
    body: Option<&str>,
    timeout: Duration,
) -> Result<String, String> {
    let mut stream = TcpStream::connect("127.0.0.1:11434")
        .map_err(|_| "Ollama is not running on 127.0.0.1:11434.".to_string())?;
    stream
        .set_read_timeout(Some(timeout))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(10)))
        .map_err(|error| error.to_string())?;

    let body = body.unwrap_or("");
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:11434\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.as_bytes().len(),
        body
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| error.to_string())?;

    let (head, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| "Invalid Ollama HTTP response.".to_string())?;

    if !head.contains(" 200 ") {
        return Err(body.trim().to_string());
    }

    Ok(body.to_string())
}

fn read_import_jobs(app: &AppHandle) -> Result<Vec<ImportJob>, String> {
    let path = import_jobs_path(app)?;

    if !path.is_file() {
        return Ok(Vec::new());
    }

    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

fn write_import_jobs(app: &AppHandle, jobs: &[ImportJob]) -> Result<(), String> {
    write_json(&import_jobs_path(app)?, jobs)
}

fn write_json<T: Serialize + ?Sized>(path: &PathBuf, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let raw = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())
}

fn model_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("model-runtime.json"))
}

fn account_profile_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("account-profile.json"))
}

fn import_jobs_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("import-jobs.json"))
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn parse_note_id(source_url: &str) -> Option<String> {
    if !source_url.contains("xiaohongshu.com") {
        return None;
    }

    source_url
        .split('?')
        .next()
        .unwrap_or(source_url)
        .trim_end_matches('/')
        .split('/')
        .filter(|part| !part.is_empty())
        .last()
        .map(|part| part.to_string())
}

fn now_stamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();

    millis.to_string()
}
