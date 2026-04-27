use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;
use tauri::{path::BaseDirectory, AppHandle, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

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
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContentAgentOutput {
    title: String,
    body: String,
    tags: Vec<String>,
    trace: serde_json::Value,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgeItem {
    id: Option<String>,
    title: String,
    content: String,
    category: String,
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
            last_used_at: "未使用".to_string(),
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
            "均衡 Agent 套装",
            &[
                "qwen3-1.7b-q4",
                "qwen3-4b-q4",
                "gemma4-e2b-q4",
                "qwen2.5-vl-3b-q4",
                "qwen3-embedding-0.6b-q8",
            ],
            "轻量规划 + 主写作 + 复核 + 视觉理解，适合 16GB 内存机器。",
            &options,
        ),
        build_suite(
            "low-power-agent-suite",
            "低功耗 Agent 套装",
            &[
                "qwen3-1.7b-q4",
                "qwen2.5-1.5b-q4",
                "qwen2-vl-2b-q4",
                "qwen3-embedding-0.6b-q8",
            ],
            "更适合轻薄本，优先降低 CPU/内存压力。",
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
        .ok_or_else(|| "模型下载选项不存在。".to_string())?;
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
        .ok_or_else(|| "模型套装不存在。".to_string())?;
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
async fn run_content_agent(
    app: AppHandle,
    input: ContentAgentInput,
) -> Result<ContentAgentOutput, String> {
    let profile = read_account_profile(&app)?;
    let settings = read_runtime_settings(&app)?;
    let metrics = build_runtime_metrics(&settings);
    let model_suite = resolve_agent_model_suite(&settings, &metrics, &input)?;
    let knowledge = retrieve_relevant_knowledge(&app, &settings, &metrics, &input).await?;
    let sidecar_entry_path = resolve_sidecar_entry_path(&app)?;
    let payload = serde_json::json!({
        "kind": "content",
        "topic": input.topic,
        "goal": input.goal,
        "references": input.references,
        "model": model_suite["writer"].clone(),
        "modelSuite": model_suite,
        "runtime": runtime_plan(&metrics, &settings),
        "memory": {
            "accountName": profile.account_name,
            "track": profile.track,
            "persona": profile.persona,
            "toneStyle": profile.tone_style,
            "forbiddenWords": profile.forbidden_words
        },
        "knowledge": knowledge.iter().map(|entry| serde_json::json!({
            "id": entry.item.id.clone(),
            "title": entry.item.title.clone(),
            "content": entry.item.content.clone(),
            "category": entry.item.category.clone(),
            "similarity": entry.similarity
        })).collect::<Vec<_>>(),
        "skills": [
            "HookTitleSkill",
            "PersonaToneSkill",
            "KnowledgeGroundingSkill",
            "StructureSkill",
            "RiskWordAvoidSkill"
        ]
    });

    let payload_path = write_agent_payload(&app, &payload)?;
    let (mut rx, _child) = app
        .shell()
        .sidecar("bun")
        .map_err(|error| format!("无法创建 Bun 侧车命令：{error}"))?
        .args([
            sidecar_entry_path.to_string_lossy().as_ref(),
            payload_path.to_string_lossy().as_ref(),
        ])
        .spawn()
        .map_err(|error| format!("无法启动 Bun Agent 侧车进程：{error}"))?;
    let mut stderr = String::new();
    let mut final_output: Option<ContentAgentOutput> = None;
    let mut exit_code: Option<i32> = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let line = String::from_utf8_lossy(&line).trim().to_string();
                if line.is_empty() {
                    continue;
                }
                let value: serde_json::Value = serde_json::from_str(&line)
                    .map_err(|error| format!("解析 Agent 流式事件失败：{error}: {line}"))?;
                if value.get("type").and_then(|item| item.as_str()) == Some("final") {
                    let output = value
                        .get("output")
                        .cloned()
                        .ok_or_else(|| "Agent final 事件缺少 output".to_string())?;
                    final_output = Some(
                        serde_json::from_value(output)
                            .map_err(|error| format!("解析 Agent 最终输出失败：{error}"))?,
                    );
                } else {
                    let _ = app.emit("content-agent-event", value);
                }
            }
            CommandEvent::Stderr(line) => {
                stderr.push_str(&String::from_utf8_lossy(&line));
            }
            CommandEvent::Error(error) => {
                stderr.push_str(&error);
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
                break;
            }
            _ => {}
        }
    }
    remove_file_if_exists(&payload_path);

    if exit_code.unwrap_or(1) != 0 {
        let stderr = stderr.trim().to_string();
        return Err(format!("Agent 运行失败：{stderr}"));
    }

    let stdout =
        serde_json::to_string(&final_output.ok_or_else(|| "Agent 没有返回最终草稿。".to_string())?)
            .map_err(|error| error.to_string())?;
    serde_json::from_str(&stdout).map_err(|error| format!("解析 Agent 输出失败：{error}"))
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
    let item = KnowledgeItem {
        id: Some(format!("knowledge-{}", now_stamp())),
        title,
        content,
        category,
    };
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
        .plugin(tauri_plugin_shell::init())
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
            run_content_agent,
            add_knowledge_item,
            list_import_jobs,
            create_import_job,
            run_import_job,
            retry_import_job
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn write_agent_payload(app: &AppHandle, payload: &serde_json::Value) -> Result<PathBuf, String> {
    let path = app_data_dir(app)?.join(format!("agent-input-{}.json", now_stamp()));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&path, payload.to_string()).map_err(|error| error.to_string())?;
    Ok(path)
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
            "select id, title, content, category from knowledge_items order by created_at desc",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(KnowledgeItem {
                id: Some(row.get::<_, String>(0)?),
                title: row.get(1)?,
                content: row.get(2)?,
                category: row.get(3)?,
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
                item.id
                    .clone()
                    .unwrap_or_else(|| format!("knowledge-{}", now_stamp())),
                item.title,
                item.content,
                item.category,
                now_stamp()
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
    app: &AppHandle,
    model: &ModelConfig,
    metrics: &RuntimeMetrics,
    texts: Vec<String>,
) -> Result<EmbeddingSidecarOutput, String> {
    if texts.is_empty() {
        return Ok(EmbeddingSidecarOutput {
            model_id: model.id.clone(),
            dimension: 0,
            embeddings: Vec::new(),
        });
    }

    let sidecar_entry_path = resolve_sidecar_entry_path(app)?;
    let payload = serde_json::json!({
        "kind": "embed",
        "model": model_json(model, "embedding", "semantic memory embedding"),
        "runtime": {
            "maxThreads": metrics.cpu_count.min(4).max(1),
            "contextSize": 2048,
            "batchSize": 128,
            "gpu": false,
            "cpuLimitPercent": 50,
            "pressure": metrics.pressure,
        },
        "texts": texts,
    });
    let payload_path = write_agent_payload(app, &payload)?;
    let output = app
        .shell()
        .sidecar("bun")
        .map_err(|error| format!("无法创建 Bun embedding 侧车命令：{error}"))?
        .args([
            sidecar_entry_path.to_string_lossy().as_ref(),
            payload_path.to_string_lossy().as_ref(),
        ])
        .output()
        .await
        .map_err(|error| format!("无法启动 Bun embedding 侧车进程：{error}"))?;
    remove_file_if_exists(&payload_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("Embedding 运行失败：{stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    serde_json::from_str(&stdout).map_err(|error| format!("解析 Embedding 输出失败：{error}"))
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
        "标题：{}\n分类：{}\n内容：{}",
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

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("models"))
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

fn resolve_sidecar_entry_path(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or_else(|| "无法解析项目根目录".to_string())?
            .join("sidecar-app")
            .join("index.ts");
        if dev_path.is_file() {
            return Ok(dev_path);
        }
    }

    app.path()
        .resolve("sidecar-app/index.ts", BaseDirectory::Resource)
        .map_err(|error| format!("无法解析 Bun 侧车脚本路径：{error}"))
}

fn remove_file_if_exists(path: &PathBuf) {
    if let Err(error) = fs::remove_file(path) {
        if error.kind() != std::io::ErrorKind::NotFound {
            log::warn!(
                "failed to remove sidecar payload {}: {}",
                path.display(),
                error
            );
        }
    }
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
        "模型下载失败，镜像和官方源都不可用：{}",
        errors.join("；")
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
        return Err(format!("下载失败：HTTP {}", response.status()));
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
            "Gemma 4 E2B，Apache 2.0，适合作为规划/复核模型。",
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
            "Gemma 4 E4B，质量更强但体积更大，建议 16GB+ 且低负载使用。",
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
            "Qwen3 轻量选项，适合低功耗和快速草稿。",
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
            "语义向量记忆/RAG 专用 embedding 模型，中文检索优先。",
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
            "质量和速度更均衡，适合 16GB 内存机器。",
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
            "质量更高，但会明显吃 CPU/内存，只建议高配机器低负载使用。",
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
            "视觉理解模型，后续图片解析节点优先使用。",
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
            "轻量视觉模型，适合截图/封面理解的低功耗套装。",
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
            "轻量模式，适合 8GB 内存或边写边做别的事。",
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
            "均衡模式，适合多数轻薄本。",
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
            "英文理解更稳，中文创作优先级低于 Qwen。",
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
            "质量更好，但只建议 16GB+ 内存且负载较低时使用。",
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
                note: note.to_string(),
                capability: capability.to_string(),
            }
        },
    )
    .collect()
}

fn resolve_agent_model_suite(
    settings: &RuntimeSettings,
    metrics: &RuntimeMetrics,
    input: &ContentAgentInput,
) -> Result<serde_json::Value, String> {
    if let Some(path) = input
        .model_path
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        let model = serde_json::json!({
            "id": input.model_id.clone().unwrap_or_else(|| "manual".to_string()),
            "label": "手动指定模型",
            "path": path,
            "paramsB": infer_params_from_path(path),
            "quant": "unknown",
            "selectedBy": "manual"
        });
        return Ok(serde_json::json!({
            "planner": model,
            "writer": model,
            "reviewer": model,
            "mode": "manual-single-model"
        }));
    }

    let available: Vec<&ModelConfig> = settings
        .models
        .iter()
        .filter(|model| {
            model.enabled
                && model.capability == "text"
                && !model.path.trim().is_empty()
                && PathBuf::from(&model.path).is_file()
        })
        .collect();

    if available.is_empty() {
        return Err("请先在设置页登记至少一个已下载的 GGUF 模型路径。".to_string());
    }

    let writer = available
        .iter()
        .copied()
        .filter(|model| Some(model.id.as_str()) == metrics.recommended_model_id.as_deref())
        .next()
        .or_else(|| {
            available
                .iter()
                .copied()
                .min_by(|a, b| a.params_b.total_cmp(&b.params_b))
        })
        .ok_or_else(|| "没有可用模型。".to_string())?;
    let planner = available
        .iter()
        .copied()
        .min_by(|a, b| a.params_b.total_cmp(&b.params_b))
        .unwrap_or(writer);
    let reviewer = available
        .iter()
        .copied()
        .filter(|model| model.params_b <= writer.params_b)
        .max_by(|a, b| a.params_b.total_cmp(&b.params_b))
        .unwrap_or(writer);

    Ok(serde_json::json!({
        "planner": model_json(planner, "planner", &metrics.recommended_reason),
        "writer": model_json(writer, "writer", &metrics.recommended_reason),
        "reviewer": model_json(reviewer, "reviewer", &metrics.recommended_reason),
        "mode": if planner.id == writer.id && writer.id == reviewer.id { "auto-single-model" } else { "auto-suite" }
    }))
}

fn model_json(model: &ModelConfig, role: &str, reason: &str) -> serde_json::Value {
    serde_json::json!({
        "id": model.id,
        "label": model.label,
        "path": model.path,
        "paramsB": model.params_b,
        "quant": model.quant,
        "selectedBy": "auto",
        "role": role,
        "reason": reason
    })
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
    let pressure =
        if cpu_usage_percent >= settings.max_cpu_percent as f32 || memory.available_gb < 4.0 {
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
                    "当前负载下推荐 {}，参数 {:.1}B，量化 {}。",
                    model.label, model.params_b, model.quant
                )
            })
            .unwrap_or_else(|| "尚未登记可用模型，先在设置页添加 GGUF 路径。".to_string()),
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
