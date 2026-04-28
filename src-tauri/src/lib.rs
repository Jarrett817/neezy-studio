use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

mod llm_runtime;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildInfo {
    app_name: String,
    app_version: String,
    target: String,
    profile: String,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContentAgentInput {
    topic: String,
    goal: String,
    references: String,
    model_path: Option<String>,
    model_id: Option<String>,
    image_path: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgeItem {
    id: Option<String>,
    title: String,
    content: String,
    category: String,
    #[serde(default)]
    updated_at: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentSkill {
    id: String,
    name: String,
    description: String,
    #[serde(default)]
    slug: String,
    #[serde(default)]
    source_kind: String,
    #[serde(default)]
    root_path: Option<String>,
    #[serde(default)]
    skill_md_path: Option<String>,
    #[serde(default)]
    instructions: String,
    prompt: String,
    enabled: bool,
    #[serde(default)]
    file_count: usize,
    #[serde(default)]
    has_scripts: bool,
    #[serde(default)]
    has_references: bool,
    #[serde(default)]
    has_assets: bool,
    #[serde(default)]
    updated_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillImportFile {
    relative_path: String,
    bytes_base64: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavePastedImageInput {
    file_name: Option<String>,
    mime_type: String,
    bytes_base64: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MemoryEventInput {
    layer: String,
    content: String,
    source: Option<String>,
}

#[derive(Clone)]
struct ScoredKnowledgeItem {
    item: KnowledgeItem,
    similarity: Option<f32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmbeddingSidecarOutput {
    model_id: String,
    dimension: usize,
    embeddings: Vec<Vec<f32>>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelConfig {
    id: String,
    label: String,
    path: String,
    params_b: f32,
    quant: String,
    size_gb: f32,
    enabled: bool,
    #[serde(default = "default_text_capability")]
    capability: String,
    #[serde(default)]
    repo: Option<String>,
    #[serde(default)]
    file: Option<String>,
    #[serde(default)]
    tokenizer_repo: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateTextInput {
    model_id: Option<String>,
    model_path: Option<String>,
    messages: Vec<LlmMessage>,
    max_tokens: Option<usize>,
    stream: Option<bool>,
    image_path: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSettings {
    hf_endpoint: String,
    prefer_low_power: bool,
    max_cpu_percent: u8,
    models: Vec<ModelConfig>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeMetrics {
    cpu_count: usize,
    cpu_usage_percent: f32,
    total_memory_gb: f32,
    available_memory_gb: f32,
    pressure: String,
    recommended_model_id: Option<String>,
    recommended_reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelDownloadOption {
    id: String,
    label: String,
    params_b: f32,
    quant: String,
    size_gb: f32,
    source: String,
    url: String,
    mirror_url: String,
    repo: String,
    note: String,
    capability: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelDownloadSuite {
    id: String,
    label: String,
    option_ids: Vec<String>,
    models: Vec<String>,
    note: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelDownloadTask {
    id: String,
    option_id: String,
    label: String,
    target_path: String,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    progress: f32,
    status: String,
    error_message: Option<String>,
}

static MODEL_DOWNLOADS: OnceLock<Mutex<Vec<ModelDownloadTask>>> = OnceLock::new();

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
    content: String,
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
fn get_workspace_snapshot(app: AppHandle) -> Result<WorkspaceSnapshot, String> {
    let knowledge_items = read_knowledge_items(&app)?;
    let knowledge: Vec<KnowledgePreview> = knowledge_items
        .into_iter()
        .map(|item| KnowledgePreview {
            id: item.id.unwrap_or_else(|| item.title.clone()),
            title: item.title,
            category: item.category,
            content: item.content,
            last_used_at: "unused".to_string(),
        })
        .collect();

    let knowledge_count = knowledge.len() as u32;

    Ok(WorkspaceSnapshot {
        summary: DashboardSummary {
            draft_count: 0,
            ready_to_publish_count: 0,
            knowledge_count,
            weekly_post_count: 0,
        },
        drafts: Vec::new(),
        knowledge,
        metrics: Vec::new(),
    })
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
fn get_runtime_settings(app: AppHandle) -> Result<RuntimeSettings, String> {
    read_runtime_settings(&app)
}

#[tauri::command]
fn save_runtime_settings(
    app: AppHandle,
    settings: RuntimeSettings,
) -> Result<RuntimeSettings, String> {
    write_runtime_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn get_runtime_metrics(app: AppHandle) -> Result<RuntimeMetrics, String> {
    let settings = read_runtime_settings(&app)?;
    Ok(build_runtime_metrics(&settings))
}

#[tauri::command]
fn get_model_download_options(app: AppHandle) -> Result<Vec<ModelDownloadOption>, String> {
    let settings = read_runtime_settings(&app)?;
    Ok(model_download_options(&settings.hf_endpoint))
}

#[tauri::command]
fn get_model_download_suites() -> Vec<ModelDownloadSuite> {
    let options = model_download_options("https://hf-mirror.com");
    vec![
        build_suite(
            "balanced-agent-suite",
            "Balanced Agent Suite",
            &[
                "qwen3-1.7b-q4",
                "qwen3-4b-q4",
                "gemma4-e2b-q4",
                "qwen2.5-vl-3b-q4",
                "qwen3-embedding-0.6b-q8",
            ],
            "Planner + writer + reviewer + vision + embedding for 16GB RAM laptops.",
            &options,
        ),
        build_suite(
            "low-power-agent-suite",
            "Low Power Agent Suite",
            &[
                "qwen3-1.7b-q4",
                "qwen2.5-1.5b-q4",
                "qwen2-vl-2b-q4",
                "qwen3-embedding-0.6b-q8",
            ],
            "Lower CPU and memory pressure for thin laptops.",
            &options,
        ),
    ]
}
#[tauri::command]
fn start_model_download(app: AppHandle, option_id: String) -> Result<ModelDownloadTask, String> {
    let settings = read_runtime_settings(&app)?;
    let option = model_download_options(&settings.hf_endpoint)
        .into_iter()
        .find(|item| item.id == option_id)
        .ok_or_else(|| "model download option not found".to_string())?;
    let target_dir = models_dir(&app)?;
    fs::create_dir_all(&target_dir).map_err(|error| error.to_string())?;
    let target_path = target_dir.join(download_filename(&option));
    let task = ModelDownloadTask {
        id: format!("download-{}", now_stamp()),
        option_id: option.id.clone(),
        label: option.label.clone(),
        target_path: target_path.to_string_lossy().to_string(),
        downloaded_bytes: 0,
        total_bytes: None,
        progress: 0.0,
        status: "running".to_string(),
        error_message: None,
    };

    downloads()
        .lock()
        .map_err(|error| error.to_string())?
        .push(task.clone());
    let app_for_task = app.clone();
    let task_id = task.id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        run_model_download(app_for_task, task_id, option, target_path);
    });

    Ok(task)
}

#[tauri::command]
fn start_model_suite_download(
    app: AppHandle,
    suite_id: String,
) -> Result<Vec<ModelDownloadTask>, String> {
    let suite = get_model_download_suites()
        .into_iter()
        .find(|item| item.id == suite_id)
        .ok_or_else(|| "model suite not found".to_string())?;
    suite
        .option_ids
        .into_iter()
        .map(|option_id| start_model_download(app.clone(), option_id))
        .collect()
}

#[tauri::command]
fn get_model_download_tasks() -> Result<Vec<ModelDownloadTask>, String> {
    Ok(downloads()
        .lock()
        .map_err(|error| error.to_string())?
        .clone())
}

#[tauri::command]
async fn generate_text_stream(app: AppHandle, input: GenerateTextInput) -> Result<String, String> {
    let settings = read_runtime_settings(&app)?;
    let metrics = build_runtime_metrics(&settings);
    let model = resolve_llm_model(
        &settings,
        &metrics,
        input.model_id.as_deref(),
        input.model_path.as_deref(),
    )?;
    let runtime = runtime_plan(&metrics, &settings);
    let max_tokens = input.max_tokens.unwrap_or_else(|| {
        if metrics.pressure == "high" {
            512
        } else {
            1024
        }
    });
    let stream = input.stream.unwrap_or(true);

    llm_runtime::generate_text_stream(
        app,
        llm_runtime::RuntimeModel {
            path: model.path.clone(),
            repo: model.repo.clone(),
            file: model.file.clone(),
            tokenizer_repo: model.tokenizer_repo.clone(),
        },
        input.messages,
        runtime,
        max_tokens,
        stream,
        input.image_path,
    )
    .await
}

#[tauri::command]
async fn get_relevant_knowledge(
    app: AppHandle,
    input: ContentAgentInput,
) -> Result<Vec<KnowledgePreview>, String> {
    let _manual_model_hint = (&input.model_path, &input.model_id);
    let _vision_hint = &input.image_path;
    let settings = read_runtime_settings(&app)?;
    let metrics = build_runtime_metrics(&settings);
    let items = retrieve_relevant_knowledge(&app, &settings, &metrics, &input).await?;
    Ok(items
        .into_iter()
        .map(|entry| KnowledgePreview {
            id: entry.item.id.unwrap_or_default(),
            title: entry.item.title,
            category: entry.item.category,
            content: entry.item.content,
            last_used_at: entry
                .similarity
                .map(|score| format!("score {:.3}", score))
                .unwrap_or_else(|| "keyword".to_string()),
        })
        .collect())
}

#[tauri::command]
fn list_knowledge_items(app: AppHandle) -> Result<Vec<KnowledgeItem>, String> {
    read_knowledge_items(&app)
}

#[tauri::command]
async fn save_knowledge_item(app: AppHandle, item: KnowledgeItem) -> Result<KnowledgeItem, String> {
    let saved = with_saved_knowledge_item(item);
    upsert_knowledge_item(&app, &saved)?;
    if let Ok(settings) = read_runtime_settings(&app) {
        let metrics = build_runtime_metrics(&settings);
        if let Err(error) =
            ensure_knowledge_embeddings(&app, &settings, &metrics, &[saved.clone()]).await
        {
            log::warn!("failed to embed knowledge item: {}", error);
        }
    }
    Ok(saved)
}

#[tauri::command]
fn delete_knowledge_item(app: AppHandle, id: String) -> Result<(), String> {
    let connection = open_memory_db(&app)?;
    connection
        .execute("delete from knowledge_items where id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_skills(app: AppHandle) -> Result<Vec<AgentSkill>, String> {
    read_skills(&app).map(|skills| skills.into_iter().map(normalize_skill).collect())
}

#[tauri::command]
fn save_skill(app: AppHandle, skill: AgentSkill) -> Result<AgentSkill, String> {
    let mut skills = read_skills(&app)?;
    let normalized = normalize_skill(skill);
    if let Some(existing) = skills.iter_mut().find(|item| item.id == normalized.id) {
        *existing = normalized.clone();
    } else {
        skills.push(normalized.clone());
    }
    write_skills(&app, &skills)?;
    Ok(normalized)
}

#[tauri::command]
fn set_skill_enabled(app: AppHandle, id: String, enabled: bool) -> Result<AgentSkill, String> {
    let mut skills = read_skills(&app)?;
    let skill = skills
        .iter_mut()
        .find(|item| item.id == id)
        .ok_or_else(|| "skill not found".to_string())?;
    skill.enabled = enabled;
    skill.updated_at = Some(now_stamp());
    let normalized = normalize_skill(skill.clone());
    *skill = normalized.clone();
    write_skills(&app, &skills)?;
    Ok(normalized)
}

#[tauri::command]
fn import_skill_archive(
    app: AppHandle,
    archive_name: String,
    archive_base64: String,
) -> Result<AgentSkill, String> {
    let bytes = decode_base64_bytes(&archive_base64)?;
    let import_dir = create_skill_import_dir(&app, &archive_name)?;
    extract_zip_archive(&bytes, &import_dir)?;
    let skill_root = find_skill_root(&import_dir)?
        .ok_or_else(|| "zip 中没有找到合法的 SKILL.md".to_string())?;
    let skill = build_skill_from_root(&skill_root, "zip")?;
    upsert_imported_skill(&app, skill)
}

#[tauri::command]
fn import_skill_folder(
    app: AppHandle,
    folder_name: String,
    files: Vec<SkillImportFile>,
) -> Result<AgentSkill, String> {
    let import_dir = create_skill_import_dir(&app, &folder_name)?;
    write_imported_files(&import_dir, &files)?;
    let skill_root = find_skill_root(&import_dir)?
        .ok_or_else(|| "文件夹中没有找到合法的 SKILL.md".to_string())?;
    let skill = build_skill_from_root(&skill_root, "folder")?;
    upsert_imported_skill(&app, skill)
}

#[tauri::command]
fn delete_skill(app: AppHandle, id: String) -> Result<(), String> {
    let mut skills = read_skills(&app)?;
    if let Some(skill) = skills.iter().find(|skill| skill.id == id) {
        if let Some(root_path) = skill.root_path.as_deref() {
            let path = PathBuf::from(root_path);
            if path.is_dir() {
                let _ = fs::remove_dir_all(path);
            }
        }
    }
    skills.retain(|skill| skill.id != id);
    write_skills(&app, &skills)
}

#[tauri::command]
fn add_memory_event(app: AppHandle, input: MemoryEventInput) -> Result<(), String> {
    let connection = open_memory_db(&app)?;
    connection
        .execute(
            "insert into memory_events (id, layer, content, source, created_at)
             values (?1, ?2, ?3, ?4, ?5)",
            params![
                format!("memory-{}", now_stamp()),
                input.layer,
                input.content,
                input.source,
                now_stamp()
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn cancel_generation() {
    llm_runtime::cancel_generation();
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

#[tauri::command]
async fn add_knowledge_item(
    app: AppHandle,
    title: String,
    content: String,
    category: String,
) -> Result<KnowledgeItem, String> {
    let item = with_saved_knowledge_item(KnowledgeItem {
        id: Some(format!("knowledge-{}", now_stamp())),
        title,
        content,
        category,
        updated_at: None,
    });
    upsert_knowledge_item(&app, &item)?;
    if let Ok(settings) = read_runtime_settings(&app) {
        let metrics = build_runtime_metrics(&settings);
        if let Err(error) =
            ensure_knowledge_embeddings(&app, &settings, &metrics, &[item.clone()]).await
        {
            log::warn!("failed to embed knowledge item: {}", error);
        }
    }
    Ok(item)
}

#[tauri::command]
fn save_pasted_image(app: AppHandle, input: SavePastedImageInput) -> Result<String, String> {
    let bytes = decode_base64_bytes(&input.bytes_base64)?;
    let dir = app_data_dir(&app)?.join("pasted-images");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let extension = image_extension_for_mime(&input.mime_type);
    let file_name = input
        .file_name
        .as_deref()
        .map(sanitize_file_name)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| format!("pasted-{}", now_stamp()));
    let path = dir.join(format!("{file_name}.{extension}"));
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
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
            get_runtime_settings,
            save_runtime_settings,
            get_runtime_metrics,
            get_model_download_options,
            get_model_download_suites,
            start_model_download,
            start_model_suite_download,
            get_model_download_tasks,
            generate_text_stream,
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
            retry_import_job
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn read_account_profile(app: &AppHandle) -> Result<AccountProfile, String> {
    let connection = open_memory_db(app)?;
    if let Some(profile) = connection
        .query_row(
            "select account_name, track, persona, tone_style, forbidden_words from account_profile where id = 1",
            [],
            |row| {
                Ok(AccountProfile {
                    account_name: row.get(0)?,
                    track: row.get(1)?,
                    persona: row.get(2)?,
                    tone_style: row.get(3)?,
                    forbidden_words: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())?
    {
        return Ok(profile);
    }

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
    let connection = open_memory_db(app)?;
    connection
        .execute(
            "insert into account_profile (id, account_name, track, persona, tone_style, forbidden_words, updated_at)
             values (1, ?1, ?2, ?3, ?4, ?5, ?6)
             on conflict(id) do update set
               account_name = excluded.account_name,
               track = excluded.track,
               persona = excluded.persona,
               tone_style = excluded.tone_style,
               forbidden_words = excluded.forbidden_words,
               updated_at = excluded.updated_at",
            params![
                profile.account_name,
                profile.track,
                profile.persona,
                profile.tone_style,
                profile.forbidden_words,
                now_stamp()
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
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

fn read_knowledge_items(app: &AppHandle) -> Result<Vec<KnowledgeItem>, String> {
    let connection = open_memory_db(app)?;
    let mut statement = connection
        .prepare(
            "select id, title, content, category, updated_at from knowledge_items order by updated_at desc, created_at desc",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(KnowledgeItem {
                id: Some(row.get::<_, String>(0)?),
                title: row.get(1)?,
                content: row.get(2)?,
                category: row.get(3)?,
                updated_at: Some(row.get(4)?),
            })
        })
        .map_err(|error| error.to_string())?;
    let items = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    if !items.is_empty() {
        return Ok(items);
    }

    let path = knowledge_items_path(app)?;
    if !path.is_file() {
        return Ok(Vec::new());
    }

    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

fn upsert_knowledge_item(app: &AppHandle, item: &KnowledgeItem) -> Result<(), String> {
    let connection = open_memory_db(app)?;
    let now = now_stamp();
    let id = item
        .id
        .clone()
        .unwrap_or_else(|| format!("knowledge-{}", now.clone()));
    connection
        .execute(
            "insert into knowledge_items (id, title, content, category, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?5)
             on conflict(id) do update set
               title = excluded.title,
               content = excluded.content,
               category = excluded.category,
               updated_at = excluded.updated_at",
            params![
                id,
                item.title,
                item.content,
                item.category,
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

async fn retrieve_relevant_knowledge(
    app: &AppHandle,
    settings: &RuntimeSettings,
    metrics: &RuntimeMetrics,
    input: &ContentAgentInput,
) -> Result<Vec<ScoredKnowledgeItem>, String> {
    let items = read_knowledge_items(app)?;
    if items.is_empty() {
        return Ok(Vec::new());
    }

    let Some(embedding_model) = select_embedding_model(settings) else {
        return Ok(keyword_knowledge(items, input));
    };

    ensure_knowledge_embeddings(app, settings, metrics, &items).await?;
    let query = format!("{}\n{}\n{}", input.topic, input.goal, input.references);
    let query_embedding = embed_texts(app, embedding_model, metrics, vec![query]).await?;
    let Some(query_vector) = query_embedding.embeddings.into_iter().next() else {
        return Ok(keyword_knowledge(items, input));
    };

    let records = read_embedding_records(app, &embedding_model.id)?;
    let mut scored = items
        .into_iter()
        .filter_map(|item| {
            let id = item.id.as_ref()?;
            let vector = records
                .iter()
                .find(|record| &record.owner_id == id)
                .map(|record| record.vector.as_slice())?;
            Some(ScoredKnowledgeItem {
                item,
                similarity: Some(cosine_similarity(&query_vector, vector)),
            })
        })
        .collect::<Vec<_>>();

    scored.sort_by(|a, b| {
        b.similarity
            .unwrap_or(0.0)
            .total_cmp(&a.similarity.unwrap_or(0.0))
    });
    scored.truncate(8);
    Ok(scored)
}

async fn ensure_knowledge_embeddings(
    app: &AppHandle,
    settings: &RuntimeSettings,
    metrics: &RuntimeMetrics,
    items: &[KnowledgeItem],
) -> Result<(), String> {
    let Some(model) = select_embedding_model(settings) else {
        return Ok(());
    };
    let existing_ids = read_embedding_owner_ids(app, &model.id)?;
    let missing = items
        .iter()
        .filter(|item| {
            item.id
                .as_ref()
                .map(|id| !existing_ids.iter().any(|existing| existing == id))
                .unwrap_or(false)
        })
        .cloned()
        .collect::<Vec<_>>();
    if missing.is_empty() {
        return Ok(());
    }

    let texts = missing
        .iter()
        .map(knowledge_embedding_text)
        .collect::<Vec<_>>();
    let output = embed_texts(app, model, metrics, texts).await?;
    for (item, vector) in missing.iter().zip(output.embeddings.into_iter()) {
        if let Some(id) = item.id.as_ref() {
            write_embedding_record(
                app,
                "knowledge",
                id,
                &output.model_id,
                output.dimension,
                &vector,
            )?;
        }
    }
    Ok(())
}

async fn embed_texts(
    _app: &AppHandle,
    model: &ModelConfig,
    _metrics: &RuntimeMetrics,
    texts: Vec<String>,
) -> Result<EmbeddingSidecarOutput, String> {
    if texts.is_empty() {
        return Ok(EmbeddingSidecarOutput {
            model_id: model.id.clone(),
            dimension: 0,
            embeddings: Vec::new(),
        });
    }

    let embeddings = llm_runtime::embed_texts(
        llm_runtime::RuntimeModel {
            path: model.path.clone(),
            repo: model.repo.clone(),
            file: model.file.clone(),
            tokenizer_repo: model.tokenizer_repo.clone(),
        },
        texts,
    )
    .await?;
    let dimension = embeddings.first().map(Vec::len).unwrap_or(0);
    Ok(EmbeddingSidecarOutput {
        model_id: model.id.clone(),
        dimension,
        embeddings,
    })
}

#[derive(Clone)]
struct EmbeddingRecord {
    owner_id: String,
    vector: Vec<f32>,
}

fn read_embedding_owner_ids(app: &AppHandle, model_id: &str) -> Result<Vec<String>, String> {
    let connection = open_memory_db(app)?;
    let mut statement = connection
        .prepare(
            "select owner_id from memory_embeddings
             where owner_type = 'knowledge' and embedding_model_id = ?1",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![model_id], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn read_embedding_records(app: &AppHandle, model_id: &str) -> Result<Vec<EmbeddingRecord>, String> {
    let connection = open_memory_db(app)?;
    let mut statement = connection
        .prepare(
            "select owner_id, vector_json from memory_embeddings
             where owner_type = 'knowledge' and embedding_model_id = ?1",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![model_id], |row| {
            let vector_json: String = row.get(1)?;
            let vector = serde_json::from_str::<Vec<f32>>(&vector_json).unwrap_or_default();
            Ok(EmbeddingRecord {
                owner_id: row.get(0)?,
                vector,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn write_embedding_record(
    app: &AppHandle,
    owner_type: &str,
    owner_id: &str,
    model_id: &str,
    dimension: usize,
    vector: &[f32],
) -> Result<(), String> {
    let connection = open_memory_db(app)?;
    let vector_json = serde_json::to_string(vector).map_err(|error| error.to_string())?;
    connection
        .execute(
            "insert into memory_embeddings
               (id, owner_type, owner_id, embedding_model_id, dimension, vector_json, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             on conflict(owner_type, owner_id, embedding_model_id) do update set
               dimension = excluded.dimension,
               vector_json = excluded.vector_json,
               updated_at = excluded.updated_at",
            params![
                format!("{owner_type}-{owner_id}-{model_id}"),
                owner_type,
                owner_id,
                model_id,
                dimension as i64,
                vector_json,
                now_stamp()
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn select_embedding_model(settings: &RuntimeSettings) -> Option<&ModelConfig> {
    settings
        .models
        .iter()
        .filter(|model| {
            model.enabled
                && model.capability == "embedding"
                && !model.path.trim().is_empty()
                && PathBuf::from(&model.path).is_file()
        })
        .min_by(|a, b| a.size_gb.total_cmp(&b.size_gb))
}

fn knowledge_embedding_text(item: &KnowledgeItem) -> String {
    format!(
        "title: {}\ncategory: {}\ncontent: {}",
        item.title, item.category, item.content
    )
}

fn keyword_knowledge(
    items: Vec<KnowledgeItem>,
    input: &ContentAgentInput,
) -> Vec<ScoredKnowledgeItem> {
    let query = format!("{} {} {}", input.topic, input.goal, input.references).to_lowercase();
    let mut scored = items
        .into_iter()
        .map(|item| {
            let text = format!("{} {} {}", item.title, item.category, item.content).to_lowercase();
            let score = query
                .split(|character: char| {
                    character.is_whitespace()
                        || character == ','
                        || character == '，'
                        || character == '.'
                })
                .filter(|token| token.len() >= 2 && text.contains(token))
                .count() as f32;
            ScoredKnowledgeItem {
                item,
                similarity: if score > 0.0 { Some(score) } else { None },
            }
        })
        .collect::<Vec<_>>();
    scored.sort_by(|a, b| {
        b.similarity
            .unwrap_or(0.0)
            .total_cmp(&a.similarity.unwrap_or(0.0))
    });
    scored.truncate(8);
    scored
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0;
    let mut norm_a = 0.0;
    let mut norm_b = 0.0;
    for (left, right) in a.iter().zip(b.iter()) {
        dot += left * right;
        norm_a += left * left;
        norm_b += right * right;
    }
    if norm_a <= f32::EPSILON || norm_b <= f32::EPSILON {
        return 0.0;
    }
    dot / (norm_a.sqrt() * norm_b.sqrt())
}

fn read_runtime_settings(app: &AppHandle) -> Result<RuntimeSettings, String> {
    let path = runtime_settings_path(app)?;
    if !path.is_file() {
        return Ok(default_runtime_settings());
    }

    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

fn write_runtime_settings(app: &AppHandle, settings: &RuntimeSettings) -> Result<(), String> {
    write_json(&runtime_settings_path(app)?, settings)
}

fn write_json<T: Serialize + ?Sized>(path: &PathBuf, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let raw = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())
}

fn account_profile_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("account-profile.json"))
}

fn import_jobs_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("import-jobs.json"))
}

fn knowledge_items_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("knowledge-items.json"))
}

fn runtime_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("runtime-settings.json"))
}

fn skills_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("skills.json"))
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("models"))
}

fn skill_packages_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("skill-packages"))
}

fn memory_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("neezy-memory.sqlite"))
}

fn open_memory_db(app: &AppHandle) -> Result<Connection, String> {
    let path = memory_db_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    init_memory_db(&connection)?;
    Ok(connection)
}

fn init_memory_db(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "
            create table if not exists account_profile (
              id integer primary key check (id = 1),
              account_name text not null default '',
              track text not null default '',
              persona text not null default '',
              tone_style text not null default '',
              forbidden_words text not null default '',
              updated_at text not null
            );

            create table if not exists knowledge_items (
              id text primary key,
              title text not null,
              content text not null,
              category text not null,
              created_at text not null,
              updated_at text not null
            );

            create table if not exists memory_events (
              id text primary key,
              layer text not null,
              content text not null,
              source text,
              created_at text not null
            );

            create table if not exists memory_embeddings (
              id text primary key,
              owner_type text not null,
              owner_id text not null,
              embedding_model_id text not null,
              dimension integer not null,
              vector_json text not null,
              updated_at text not null,
              unique(owner_type, owner_id, embedding_model_id)
            );

            create index if not exists idx_knowledge_category on knowledge_items(category);
            create index if not exists idx_memory_layer on memory_events(layer);
            create index if not exists idx_embedding_owner on memory_embeddings(owner_type, owner_id);
            create index if not exists idx_embedding_model on memory_embeddings(embedding_model_id);
            ",
        )
        .map_err(|error| error.to_string())
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn default_runtime_settings() -> RuntimeSettings {
    RuntimeSettings {
        hf_endpoint: "https://hf-mirror.com".to_string(),
        prefer_low_power: true,
        max_cpu_percent: 70,
        models: Vec::new(),
    }
}

fn default_text_capability() -> String {
    "text".to_string()
}

fn read_skills(app: &AppHandle) -> Result<Vec<AgentSkill>, String> {
    let path = skills_path(app)?;
    if !path.is_file() {
        return Ok(default_skills());
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

fn write_skills(app: &AppHandle, skills: &[AgentSkill]) -> Result<(), String> {
    write_json(&skills_path(app)?, skills)
}

fn default_skills() -> Vec<AgentSkill> {
    vec![
        AgentSkill {
            id: "content-draft".to_string(),
            name: "内容草稿".to_string(),
            description: "根据目标、素材、记忆和知识库生成草稿。".to_string(),
            prompt: "直接输出可编辑成稿，不输出思考过程。".to_string(),
            enabled: true,
            ..default_builtin_skill()
        },
        AgentSkill {
            id: "knowledge-grounding".to_string(),
            name: "知识库引用".to_string(),
            description: "优先使用知识库和用户素材，避免编造。".to_string(),
            prompt: "引用知识库信息时保持事实一致，不补不存在的数据。".to_string(),
            enabled: true,
            ..default_builtin_skill()
        },
        AgentSkill {
            id: "vision-understanding".to_string(),
            name: "图片理解".to_string(),
            description: "为视觉模型预留的图片理解能力。".to_string(),
            prompt: "当用户提供图片时，先提取画面信息，再结合文本目标生成内容。".to_string(),
            enabled: true,
            ..default_builtin_skill()
        },
    ]
}

fn default_builtin_skill() -> AgentSkill {
    AgentSkill {
        id: String::new(),
        name: String::new(),
        description: String::new(),
        slug: String::new(),
        source_kind: "builtin".to_string(),
        root_path: None,
        skill_md_path: None,
        instructions: String::new(),
        prompt: String::new(),
        enabled: true,
        file_count: 1,
        has_scripts: false,
        has_references: false,
        has_assets: false,
        updated_at: Some(now_stamp()),
    }
}

fn normalize_skill(mut skill: AgentSkill) -> AgentSkill {
    if skill.slug.trim().is_empty() {
        skill.slug = slugify(&skill.name);
    }
    if skill.source_kind.trim().is_empty() {
        skill.source_kind = "legacy".to_string();
    }
    if skill.instructions.trim().is_empty() {
        skill.instructions = skill.prompt.clone();
    }
    if skill.prompt.trim().is_empty() {
        skill.prompt = first_nonempty_line(&skill.instructions);
    }
    if skill.updated_at.is_none() {
        skill.updated_at = Some(now_stamp());
    }
    skill
}

fn with_saved_knowledge_item(item: KnowledgeItem) -> KnowledgeItem {
    KnowledgeItem {
        id: item
            .id
            .or_else(|| Some(format!("knowledge-{}", now_stamp()))),
        title: item.title,
        content: item.content,
        category: item.category,
        updated_at: Some(now_stamp()),
    }
}

fn upsert_imported_skill(app: &AppHandle, skill: AgentSkill) -> Result<AgentSkill, String> {
    let normalized = normalize_skill(skill);
    let mut skills = read_skills(app)?
        .into_iter()
        .map(normalize_skill)
        .collect::<Vec<_>>();
    skills.retain(|existing| existing.id != normalized.id);
    skills.push(normalized.clone());
    write_skills(app, &skills)?;
    Ok(normalized)
}

fn create_skill_import_dir(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let slug = slugify(name);
    let dir = skill_packages_dir(app)?.join(format!("{slug}-{}", now_stamp()));
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn write_imported_files(dir: &Path, files: &[SkillImportFile]) -> Result<(), String> {
    for file in files {
        let relative = sanitize_relative_path(&file.relative_path)?;
        let output = dir.join(relative);
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let bytes = decode_base64_bytes(&file.bytes_base64)?;
        fs::write(output, bytes).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn extract_zip_archive(bytes: &[u8], output_dir: &Path) -> Result<(), String> {
    let reader = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|error| error.to_string())?;
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|error| error.to_string())?;
        let relative = sanitize_relative_path(file.name())?;
        let output = output_dir.join(relative);
        if file.is_dir() {
            fs::create_dir_all(&output).map_err(|error| error.to_string())?;
            continue;
        }
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .map_err(|error| error.to_string())?;
        fs::write(output, buffer).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn find_skill_root(dir: &Path) -> Result<Option<PathBuf>, String> {
    if dir.join("SKILL.md").is_file() {
        return Ok(Some(dir.to_path_buf()));
    }

    let entries = fs::read_dir(dir).map_err(|error| error.to_string())?;
    for entry in entries {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir() {
            if path.join("SKILL.md").is_file() {
                return Ok(Some(path));
            }
            if let Some(found) = find_skill_root_recursive(&path, 2)? {
                return Ok(Some(found));
            }
        }
    }
    Ok(None)
}

fn find_skill_root_recursive(dir: &Path, depth: usize) -> Result<Option<PathBuf>, String> {
    if dir.join("SKILL.md").is_file() {
        return Ok(Some(dir.to_path_buf()));
    }
    if depth == 0 {
        return Ok(None);
    }
    let entries = fs::read_dir(dir).map_err(|error| error.to_string())?;
    for entry in entries {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir() {
            if let Some(found) = find_skill_root_recursive(&path, depth - 1)? {
                return Ok(Some(found));
            }
        }
    }
    Ok(None)
}

fn build_skill_from_root(root: &Path, source_kind: &str) -> Result<AgentSkill, String> {
    let skill_md_path = root.join("SKILL.md");
    let raw = fs::read_to_string(&skill_md_path).map_err(|error| error.to_string())?;
    let (name, description, instructions) = parse_skill_markdown(&raw)?;
    let file_count = count_files(root)?;
    Ok(normalize_skill(AgentSkill {
        id: slugify(&name),
        name: name.clone(),
        description,
        slug: slugify(&name),
        source_kind: source_kind.to_string(),
        root_path: Some(root.to_string_lossy().to_string()),
        skill_md_path: Some(skill_md_path.to_string_lossy().to_string()),
        instructions: instructions.trim().to_string(),
        prompt: String::new(),
        enabled: true,
        file_count,
        has_scripts: root.join("scripts").is_dir(),
        has_references: root.join("references").is_dir(),
        has_assets: root.join("assets").is_dir(),
        updated_at: Some(now_stamp()),
    }))
}

fn parse_skill_markdown(raw: &str) -> Result<(String, String, String), String> {
    let mut parts = raw.splitn(3, "---");
    let prefix = parts.next().unwrap_or_default();
    if !prefix.trim().is_empty() {
        return Err("SKILL.md frontmatter 必须以 --- 开头".to_string());
    }
    let frontmatter = parts
        .next()
        .ok_or_else(|| "SKILL.md 缺少 frontmatter".to_string())?;
    let body = parts
        .next()
        .ok_or_else(|| "SKILL.md 缺少正文".to_string())?;
    let name = frontmatter_value(frontmatter, "name")
        .ok_or_else(|| "SKILL.md frontmatter 缺少 name".to_string())?;
    let description = frontmatter_value(frontmatter, "description")
        .ok_or_else(|| "SKILL.md frontmatter 缺少 description".to_string())?;
    Ok((name, description, body.to_string()))
}

fn frontmatter_value(frontmatter: &str, key: &str) -> Option<String> {
    frontmatter.lines().find_map(|line| {
        let trimmed = line.trim();
        trimmed
            .strip_prefix(&format!("{key}:"))
            .map(|value| value.trim().trim_matches('"').trim_matches('\'').to_string())
    })
}

fn count_files(dir: &Path) -> Result<usize, String> {
    let mut total = 0;
    let entries = fs::read_dir(dir).map_err(|error| error.to_string())?;
    for entry in entries {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir() {
            total += count_files(&path)?;
        } else {
            total += 1;
        }
    }
    Ok(total)
}

fn decode_base64_bytes(value: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;

    base64::engine::general_purpose::STANDARD
        .decode(value)
        .map_err(|error| error.to_string())
}

fn sanitize_relative_path(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => clean.push(part),
            Component::CurDir => {}
            _ => return Err(format!("非法路径: {value}")),
        }
    }
    if clean.as_os_str().is_empty() {
        return Err("空路径无效".to_string());
    }
    Ok(clean)
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }
    slug.trim_matches('-').to_string()
}

fn first_nonempty_line(value: &str) -> String {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or_default()
        .to_string()
}

fn image_extension_for_mime(mime_type: &str) -> &'static str {
    match mime_type {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "png",
    }
}

fn sanitize_file_name(value: &str) -> String {
    value.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn build_suite(
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

fn downloads() -> &'static Mutex<Vec<ModelDownloadTask>> {
    MODEL_DOWNLOADS.get_or_init(|| Mutex::new(Vec::new()))
}

fn update_download_task<F>(task_id: &str, update: F)
where
    F: FnOnce(&mut ModelDownloadTask),
{
    if let Ok(mut tasks) = downloads().lock() {
        if let Some(task) = tasks.iter_mut().find(|item| item.id == task_id) {
            update(task);
        }
    }
}

fn run_model_download(
    app: AppHandle,
    task_id: String,
    option: ModelDownloadOption,
    target_path: PathBuf,
) {
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

fn download_model_file<F>(
    option: &ModelDownloadOption,
    target_path: &PathBuf,
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
                let _ = fs::remove_file(target_path.with_extension("download"));
            }
        }
    }
    Err(format!(
        "model download failed; mirror and official source are unavailable: {}",
        errors.join("; ")
    ))
}

fn download_file<F>(url: &str, target_path: &PathBuf, on_progress: &mut F) -> Result<(), String>
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
    let mut file = fs::File::create(&temp_path).map_err(|error| error.to_string())?;
    let mut buffer = [0_u8; 1024 * 1024];
    let mut downloaded = 0_u64;

    loop {
        let read = response
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|error| error.to_string())?;
        downloaded += read as u64;
        on_progress(downloaded, total);
    }

    fs::rename(temp_path, target_path).map_err(|error| error.to_string())
}

fn register_downloaded_model(
    app: &AppHandle,
    option: &ModelDownloadOption,
    target_path: &PathBuf,
) -> Result<(), String> {
    let mut settings = read_runtime_settings(app)?;
    settings.models.retain(|model| model.id != option.id);
    settings.models.push(ModelConfig {
        id: option.id.clone(),
        label: option.label.clone(),
        path: target_path.to_string_lossy().to_string(),
        params_b: option.params_b,
        quant: option.quant.clone(),
        size_gb: option.size_gb,
        enabled: true,
        capability: option.capability.clone(),
        repo: Some(option.repo.clone()),
        file: Some(download_filename(option)),
        tokenizer_repo: tokenizer_repo_for_option(option),
    });
    write_runtime_settings(app, &settings)
}

fn download_filename(option: &ModelDownloadOption) -> String {
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

fn model_download_options(endpoint: &str) -> Vec<ModelDownloadOption> {
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
fn tokenizer_repo_for_option(option: &ModelDownloadOption) -> Option<String> {
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

fn resolve_llm_model(
    settings: &RuntimeSettings,
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
        .ok_or_else(|| "no available text model; download or register a GGUF model first".to_string())?;

    Ok(selected.clone())
}
fn runtime_plan(metrics: &RuntimeMetrics, settings: &RuntimeSettings) -> serde_json::Value {
    let cpu_count = metrics.cpu_count.max(1);
    let pressure_high = metrics.pressure == "high";
    let max_threads = if pressure_high || settings.prefer_low_power {
        (cpu_count / 2).max(2)
    } else {
        (cpu_count.saturating_sub(1)).max(2)
    };
    let context_size = if pressure_high || metrics.available_memory_gb < 6.0 {
        2048
    } else {
        4096
    };

    serde_json::json!({
        "maxThreads": max_threads,
        "contextSize": context_size,
        "batchSize": if context_size <= 2048 { 128 } else { 256 },
        "gpu": if pressure_high { serde_json::Value::Bool(false) } else { serde_json::Value::String("auto".to_string()) },
        "cpuLimitPercent": settings.max_cpu_percent,
        "pressure": metrics.pressure,
    })
}

fn build_runtime_metrics(settings: &RuntimeSettings) -> RuntimeMetrics {
    let cpu_count = std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(1);
    let memory = memory_snapshot();
    let cpu_usage_percent = cpu_usage_percent();
    let pressure = if cpu_usage_percent >= settings.max_cpu_percent as f32 || memory.available_gb < 4.0 {
        "high"
    } else if cpu_usage_percent >= 45.0 || memory.available_gb < 8.0 {
        "medium"
    } else {
        "low"
    }
    .to_string();

    let recommended = recommend_model(settings, &pressure, memory.available_gb);
    RuntimeMetrics {
        cpu_count,
        cpu_usage_percent,
        total_memory_gb: memory.total_gb,
        available_memory_gb: memory.available_gb,
        pressure,
        recommended_model_id: recommended.as_ref().map(|model| model.id.clone()),
        recommended_reason: recommended
            .map(|model| {
                format!(
                    "recommended {} ({:.1}B, {}) for current load",
                    model.label, model.params_b, model.quant
                )
            })
            .unwrap_or_else(|| "no available model registered; download or add a GGUF model first".to_string()),
    }
}
fn recommend_model<'a>(
    settings: &'a RuntimeSettings,
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

fn infer_params_from_path(path: &str) -> f32 {
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

struct MemorySnapshot {
    total_gb: f32,
    available_gb: f32,
}

#[cfg(target_os = "windows")]
fn memory_snapshot() -> MemorySnapshot {
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

    let mut status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        dwMemoryLoad: 0,
        ullTotalPhys: 0,
        ullAvailPhys: 0,
        ullTotalPageFile: 0,
        ullAvailPageFile: 0,
        ullTotalVirtual: 0,
        ullAvailVirtual: 0,
        ullAvailExtendedVirtual: 0,
    };

    let ok = unsafe { GlobalMemoryStatusEx(&mut status) };
    if ok == 0 {
        return MemorySnapshot {
            total_gb: 0.0,
            available_gb: 0.0,
        };
    }

    MemorySnapshot {
        total_gb: bytes_to_gb(status.ullTotalPhys),
        available_gb: bytes_to_gb(status.ullAvailPhys),
    }
}

#[cfg(not(target_os = "windows"))]
fn memory_snapshot() -> MemorySnapshot {
    MemorySnapshot {
        total_gb: 0.0,
        available_gb: 0.0,
    }
}

#[cfg(target_os = "windows")]
fn cpu_usage_percent() -> f32 {
    use std::{thread, time::Duration};
    use windows_sys::Win32::Foundation::FILETIME;
    use windows_sys::Win32::System::Threading::GetSystemTimes;

    fn read_times() -> Option<(u64, u64, u64)> {
        let mut idle = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let mut kernel = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let mut user = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let ok = unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) };
        if ok == 0 {
            return None;
        }
        Some((
            filetime_to_u64(idle),
            filetime_to_u64(kernel),
            filetime_to_u64(user),
        ))
    }

    let first = match read_times() {
        Some(value) => value,
        None => return 0.0,
    };
    thread::sleep(Duration::from_millis(120));
    let second = match read_times() {
        Some(value) => value,
        None => return 0.0,
    };

    let idle = second.0.saturating_sub(first.0) as f32;
    let kernel = second.1.saturating_sub(first.1) as f32;
    let user = second.2.saturating_sub(first.2) as f32;
    let total = kernel + user;
    if total <= 0.0 {
        0.0
    } else {
        ((total - idle) / total * 100.0).clamp(0.0, 100.0)
    }
}

#[cfg(not(target_os = "windows"))]
fn cpu_usage_percent() -> f32 {
    0.0
}

#[cfg(target_os = "windows")]
fn filetime_to_u64(value: windows_sys::Win32::Foundation::FILETIME) -> u64 {
    ((value.dwHighDateTime as u64) << 32) | value.dwLowDateTime as u64
}

fn bytes_to_gb(value: u64) -> f32 {
    value as f32 / 1024.0 / 1024.0 / 1024.0
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
