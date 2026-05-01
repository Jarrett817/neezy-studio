use crate::agent::memory::KnowledgeItem;
use crate::agent::skill::AgentSkill;
use crate::llm;
use crate::models;
use crate::models::download::{ModelDownloadOption, ModelDownloadSuite, ModelDownloadTask};
use crate::models::resolve::ModelConfig;
use crate::storage::db::AccountProfile;
use crate::storage::settings::RuntimeSettings;
use crate::types::{
    BuildInfo, ContentAgentInput, GenerateTextInput, ImportJob,
    JobStage, KnowledgePreview, MemoryEventInput, SavePastedImageInput, SkillImportFile,
    WorkspaceSnapshot,
};
use rusqlite::params;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

static MODEL_DOWNLOADS: OnceLock<Mutex<Vec<ModelDownloadTask>>> = OnceLock::new();

#[tauri::command]
pub fn get_build_info() -> BuildInfo {
    BuildInfo::new()
}

#[tauri::command]
pub fn get_workspace_snapshot(app: AppHandle) -> Result<WorkspaceSnapshot, String> {
    let items = crate::agent::memory::read_knowledge_items(&app)?;
    let knowledge: Vec<KnowledgePreview> = items
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
    Ok(WorkspaceSnapshot::new(knowledge_count))
}

#[tauri::command]
pub fn get_account_profile(app: AppHandle) -> Result<AccountProfile, String> {
    crate::storage::db::read_account_profile(&app)
}

#[tauri::command]
pub fn save_account_profile(
    app: AppHandle,
    profile: AccountProfile,
) -> Result<AccountProfile, String> {
    crate::storage::db::write_account_profile(&app, &profile)?;
    Ok(profile)
}

#[tauri::command]
pub fn get_runtime_settings(app: AppHandle) -> Result<RuntimeSettings, String> {
    crate::storage::settings::read_runtime_settings(&app)
}

#[tauri::command]
pub fn save_runtime_settings(
    app: AppHandle,
    settings: RuntimeSettings,
) -> Result<RuntimeSettings, String> {
    crate::storage::settings::write_runtime_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn get_runtime_metrics(app: AppHandle) -> Result<crate::RuntimeMetrics, String> {
    let settings = crate::storage::settings::read_runtime_settings(&app)?;
    let metrics = crate::system::build_runtime_metrics(&settings);

    // 用实时扫描的模型来做推荐
    let scanned = crate::models::resolve::scan_models_dir(&app);
    let recommended = crate::models::resolve::recommend_from_scanned(
        &scanned,
        &metrics.pressure,
        metrics.available_memory_gb,
    );

    Ok(crate::RuntimeMetrics {
        recommended_model_id: recommended.map(|m| m.id.clone()),
        recommended_reason: recommended
            .map(|m| {
                format!(
                    "{} ({:.1}B, {}) - 实时扫描",
                    m.label, m.params_b, m.quant
                )
            })
            .unwrap_or_else(|| "未检测到可用模型，请下载 GGUF 文件".to_string()),
        ..metrics
    })
}

#[tauri::command]
pub fn get_model_download_options(app: AppHandle) -> Result<Vec<ModelDownloadOption>, String> {
    let settings = crate::storage::settings::read_runtime_settings(&app)?;
    Ok(models::download::model_download_options(&settings.hf_endpoint))
}

#[tauri::command]
pub fn get_model_files(repo_id: String) -> Result<Vec<models::hf::HuggingFaceFile>, String> {
    models::hf::list_repo_files(&repo_id)
}

#[tauri::command]
pub fn list_hf_models(
    search: Option<String>,
    sort: Option<String>,
    page: Option<usize>,
    page_size: Option<usize>,
) -> Result<models::hf::HfModelListResult, String> {
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(20).min(50);
    models::hf::list_models(search.as_deref(), sort.as_deref(), page, page_size)
}

#[tauri::command]
pub fn get_model_download_suites() -> Vec<ModelDownloadSuite> {
    let options = models::download::model_download_options("https://hf-mirror.com");
    vec![
        models::download::build_suite(
            "balanced-agent-suite",
            "Balanced Agent Suite",
            &["qwen3-1.7b-q4", "qwen3-4b-q4", "gemma4-e2b-q4", "qwen2.5-vl-3b-q4", "qwen3-embedding-0.6b-q8"],
            "Planner + writer + reviewer + vision + embedding for 16GB RAM laptops.",
            &options,
        ),
        models::download::build_suite(
            "low-power-agent-suite",
            "Low Power Agent Suite",
            &["qwen3-1.7b-q4", "qwen2.5-1.5b-q4", "qwen2-vl-2b-q4", "qwen3-embedding-0.6b-q8"],
            "Lower CPU and memory pressure for thin laptops.",
            &options,
        ),
    ]
}

#[tauri::command]
pub fn start_model_download(app: AppHandle, option_id: String, repo_id: String, file_path: String) -> Result<ModelDownloadTask, String> {
    // 每个模型创建独立文件夹
    let target_dir = models::resolve::models_dir(&app)?.join(&repo_id);
    fs::create_dir_all(&target_dir).map_err(|error| error.to_string())?;
    let file_name = file_path.split('/').last().unwrap_or(&file_path);
    let target_path = target_dir.join(file_name);

    if target_path.is_file() {
        return Err(format!("文件已存在，无需重复下载"));
    }

    let task_id = format!("download-{}", models::download::now_stamp());
    let task = ModelDownloadTask {
        id: task_id.clone(),
        option_id: option_id.clone(),
        label: file_name.to_string(),
        target_path: target_path.to_string_lossy().to_string(),
        downloaded_bytes: 0,
        total_bytes: None,
        progress: 0.0,
        status: "running".to_string(),
        error_message: None,
    };

    downloads().lock().map_err(|error| error.to_string())?.push(task.clone());

    let task_id_clone = task_id.clone();
    let file_path_clone = file_path.clone();
    let target_path_clone = target_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = models::hf::download_model_file(
            &repo_id,
            &file_path_clone,
            &target_path_clone,
            |downloaded, total| {
                update_download_task(&task_id_clone, |task| {
                    task.downloaded_bytes = downloaded;
                    task.total_bytes = total;
                    task.progress = total.map(|t| downloaded as f32 / t as f32 * 100.0).unwrap_or(0.0).clamp(0.0, 99.0);
                });
            },
        );

        match result {
            Ok(()) => {
                // Download tokenizer.json if it exists
                let tokenizer_target = target_path_clone.parent().map(|p| p.join("tokenizer.json")).unwrap_or_default();
                if !tokenizer_target.exists() {
                    let tokenizer_result = models::hf::download_model_file(
                        &repo_id,
                        "tokenizer.json",
                        &tokenizer_target,
                        |_, _| {},
                    );
                    if tokenizer_result.is_err() {
                        log::warn!("tokenizer.json not found in repo, will be loaded from GGUF metadata");
                    }
                }
                update_download_task(&task_id_clone, |task| {
                    task.status = "done".to_string();
                    task.progress = 100.0;
                });
            }
            Err(e) => {
                let _ = std::fs::remove_file(&target_path_clone);
                update_download_task(&task_id_clone, |task| {
                    task.status = "failed".to_string();
                    task.error_message = Some(e);
                });
            }
        }
    });

    Ok(task)
}

#[tauri::command]
pub fn start_model_suite_download(
    _app: AppHandle,
    _suite_id: String,
) -> Result<Vec<ModelDownloadTask>, String> {
    Err("suite download is deprecated, use hf API to discover models".to_string())
}

#[tauri::command]
pub fn get_model_download_tasks() -> Result<Vec<ModelDownloadTask>, String> {
    Ok(downloads().lock().map_err(|error| error.to_string())?.clone())
}

#[tauri::command]
pub async fn generate_text_stream(
    app: AppHandle,
    input: GenerateTextInput,
) -> Result<String, String> {
    let settings = crate::storage::settings::read_runtime_settings(&app)?;
    let metrics = crate::build_runtime_metrics(&settings);
    let model = models::resolve::resolve_llm_model(
        &settings,
        &metrics,
        input.model_id.as_deref(),
        input.model_path.as_deref(),
    )?;
    let runtime = crate::runtime_plan(&metrics, &settings);
    let max_tokens = input.max_tokens.unwrap_or_else(|| if metrics.pressure == "high" { 512 } else { 1024 });
    let stream = input.stream.unwrap_or(true);

    llm::generate_text_stream(
        app,
        llm::RuntimeModel {
            path: model.path.clone(),
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
pub async fn get_relevant_knowledge(
    app: AppHandle,
    input: ContentAgentInput,
) -> Result<Vec<KnowledgePreview>, String> {
    let settings = crate::storage::settings::read_runtime_settings(&app)?;
    let metrics = crate::build_runtime_metrics(&settings);
    let items = crate::agent::memory::retrieve_relevant_knowledge(
        &app,
        &settings,
        &metrics,
        &input.topic,
        &input.goal,
        &input.references,
    )
    .await?;
    Ok(items
        .into_iter()
        .map(|entry| KnowledgePreview {
            id: entry.id.unwrap_or_default(),
            title: entry.title,
            category: entry.category,
            content: entry.content,
            last_used_at: "score".to_string(),
        })
        .collect())
}

#[tauri::command]
pub fn list_knowledge_items(app: AppHandle) -> Result<Vec<KnowledgeItem>, String> {
    crate::agent::memory::read_knowledge_items(&app)
}

#[tauri::command]
pub async fn save_knowledge_item(
    app: AppHandle,
    item: KnowledgeItem,
) -> Result<KnowledgeItem, String> {
    let now = models::download::now_stamp();
    let saved = KnowledgeItem {
        id: item.id.or_else(|| Some(format!("knowledge-{}", now))),
        title: item.title,
        content: item.content,
        category: item.category,
        updated_at: Some(now),
    };
    crate::agent::memory::upsert_knowledge_item(&app, &saved)?;
    if let Ok(settings) = crate::storage::settings::read_runtime_settings(&app) {
        let metrics = crate::build_runtime_metrics(&settings);
        if let Err(error) =
            crate::agent::memory::ensure_knowledge_embeddings(&app, &settings, &metrics, &[saved.clone()])
                .await
        {
            log::warn!("failed to embed knowledge item: {}", error);
        }
    }
    Ok(saved)
}

#[tauri::command]
pub fn delete_knowledge_item(app: AppHandle, id: String) -> Result<(), String> {
    let connection = crate::storage::db::open_memory_db(&app)?;
    connection
        .execute("delete from knowledge_items where id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_skills(app: AppHandle) -> Result<Vec<AgentSkill>, String> {
    crate::agent::skill::read_skills(&app).map(|skills| {
        skills.into_iter().map(crate::agent::skill::normalize_skill).collect()
    })
}

#[tauri::command]
pub fn save_skill(app: AppHandle, skill: AgentSkill) -> Result<AgentSkill, String> {
    let mut skills = crate::agent::skill::read_skills(&app)?;
    let normalized = crate::agent::skill::normalize_skill(skill);
    if let Some(existing) = skills.iter_mut().find(|item| item.id == normalized.id) {
        *existing = normalized.clone();
    } else {
        skills.push(normalized.clone());
    }
    crate::agent::skill::write_skills(&app, &skills)?;
    Ok(normalized)
}

#[tauri::command]
pub fn set_skill_enabled(app: AppHandle, id: String, enabled: bool) -> Result<AgentSkill, String> {
    let mut skills = crate::agent::skill::read_skills(&app)?;
    let skill = skills
        .iter_mut()
        .find(|item| item.id == id)
        .ok_or_else(|| "skill not found".to_string())?;
    skill.enabled = enabled;
    skill.updated_at = Some(models::download::now_stamp());
    let normalized = crate::agent::skill::normalize_skill(skill.clone());
    *skill = normalized.clone();
    crate::agent::skill::write_skills(&app, &skills)?;
    Ok(normalized)
}

#[tauri::command]
pub fn import_skill_archive(
    app: AppHandle,
    archive_name: String,
    archive_base64: String,
) -> Result<AgentSkill, String> {
    let bytes = decode_base64_bytes(&archive_base64)?;
    let import_dir = create_skill_import_dir(&app, &archive_name)?;
    extract_zip_archive(&bytes, &import_dir)?;
    let skill_root =
        find_skill_root(&import_dir)?.ok_or_else(|| "zip 中没有找到合法的 SKILL.md".to_string())?;
    let skill = crate::agent::skill::build_skill_from_root(&skill_root, "zip")?;
    upsert_imported_skill(&app, skill)
}

#[tauri::command]
pub fn import_skill_folder(
    app: AppHandle,
    folder_name: String,
    files: Vec<SkillImportFile>,
) -> Result<AgentSkill, String> {
    let import_dir = create_skill_import_dir(&app, &folder_name)?;
    write_imported_files(&import_dir, &files)?;
    let skill_root = find_skill_root(&import_dir)?
        .ok_or_else(|| "文件夹中没有找到合法的 SKILL.md".to_string())?;
    let skill = crate::agent::skill::build_skill_from_root(&skill_root, "folder")?;
    upsert_imported_skill(&app, skill)
}

#[tauri::command]
pub fn delete_skill(app: AppHandle, id: String) -> Result<(), String> {
    let mut skills = crate::agent::skill::read_skills(&app)?;
    if let Some(skill) = skills.iter().find(|skill| skill.id == id) {
        if let Some(root_path) = skill.root_path.as_deref() {
            let path = PathBuf::from(root_path);
            if path.is_dir() {
                let _ = fs::remove_dir_all(path);
            }
        }
    }
    skills.retain(|skill| skill.id != id);
    crate::agent::skill::write_skills(&app, &skills)
}

#[tauri::command]
pub fn add_memory_event(app: AppHandle, input: MemoryEventInput) -> Result<(), String> {
    let connection = crate::storage::db::open_memory_db(&app)?;
    connection
        .execute(
            "insert into memory_events (id, layer, content, source, created_at) values (?1, ?2, ?3, ?4, ?5)",
            params![
                format!("memory-{}", models::download::now_stamp()),
                input.layer,
                input.content,
                input.source,
                models::download::now_stamp()
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn cancel_generation() {
    llm::cancel_generation();
}

#[tauri::command]
pub fn list_import_jobs(app: AppHandle) -> Result<Vec<ImportJob>, String> {
    let mut jobs = read_import_jobs(&app)?;
    jobs.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(jobs)
}

#[tauri::command]
pub fn create_import_job(app: AppHandle, source_url: String) -> Result<ImportJob, String> {
    let note_id =
        parse_note_id(&source_url).ok_or_else(|| "Invalid xiaohongshu article URL.".to_string())?;
    let now = models::download::now_stamp();

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
pub fn run_import_job(app: AppHandle, job_id: String) -> Result<ImportJob, String> {
    let mut jobs = read_import_jobs(&app)?;
    let target = jobs
        .iter_mut()
        .find(|item| item.id == job_id)
        .ok_or_else(|| "Import job does not exist".to_string())?;

    target.stage = JobStage::Failed;
    target.updated_at = models::download::now_stamp();
    target.error_message = Some(
        "Real capture backend is not configured: no crawler, OCR pipeline, or model runner exists."
            .to_string(),
    );

    let failed_job = target.clone();
    write_import_jobs(&app, &jobs)?;
    Err(failed_job.error_message.clone().unwrap_or_else(|| "Import job failed".to_string()))
}

#[tauri::command]
pub fn retry_import_job(app: AppHandle, job_id: String) -> Result<ImportJob, String> {
    let mut jobs = read_import_jobs(&app)?;
    let target = jobs
        .iter_mut()
        .find(|item| item.id == job_id)
        .ok_or_else(|| "Import job does not exist".to_string())?;

    target.stage = JobStage::Queued;
    target.updated_at = models::download::now_stamp();
    target.error_message = None;
    let job = target.clone();
    write_import_jobs(&app, &jobs)?;
    Ok(job)
}

#[tauri::command]
pub async fn add_knowledge_item(
    app: AppHandle,
    title: String,
    content: String,
    category: String,
) -> Result<KnowledgeItem, String> {
    let now = models::download::now_stamp();
    let item = KnowledgeItem {
        id: Some(format!("knowledge-{}", now)),
        title,
        content,
        category,
        updated_at: Some(now),
    };
    crate::agent::memory::upsert_knowledge_item(&app, &item)?;
    if let Ok(settings) = crate::storage::settings::read_runtime_settings(&app) {
        let metrics = crate::build_runtime_metrics(&settings);
        if let Err(error) =
            crate::agent::memory::ensure_knowledge_embeddings(&app, &settings, &metrics, &[item.clone()])
                .await
        {
            log::warn!("failed to embed knowledge item: {}", error);
        }
    }
    Ok(item)
}

#[tauri::command]
pub fn save_pasted_image(app: AppHandle, input: SavePastedImageInput) -> Result<String, String> {
    let bytes = decode_base64_bytes(&input.bytes_base64)?;
    let dir = crate::storage::settings::app_data_dir(&app)?.join("pasted-images");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let extension = image_extension_for_mime(&input.mime_type);
    let file_name = input
        .file_name
        .as_deref()
        .map(sanitize_file_name)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| format!("pasted-{}", models::download::now_stamp()));
    let path = dir.join(format!("{file_name}.{extension}"));
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub option_id: String,
    pub label: String,
    pub gguf_exists: bool,
    pub tokenizer_exists: bool,
    pub size_gb: f32,
}

#[tauri::command]
pub fn get_model_status(app: AppHandle) -> Vec<ModelStatus> {
    let scanned = crate::models::resolve::scan_models_dir(&app);
    scanned
        .into_iter()
        .map(|model| {
            let gguf_path = PathBuf::from(&model.path);
            let tokenizer_path = gguf_path.parent().map(|p| p.join("tokenizer.json"));
            ModelStatus {
                option_id: model.id.clone(),
                label: model.label.clone(),
                gguf_exists: gguf_path.is_file(),
                tokenizer_exists: tokenizer_path.map(|p| p.is_file()).unwrap_or(false),
                size_gb: model.size_gb,
            }
        })
        .collect()
}

// Helper functions

pub fn downloads() -> &'static Mutex<Vec<ModelDownloadTask>> {
    MODEL_DOWNLOADS.get_or_init(|| Mutex::new(Vec::new()))
}

pub fn update_download_task<F>(task_id: &str, update: F)
where
    F: FnOnce(&mut ModelDownloadTask),
{
    if let Ok(mut tasks) = downloads().lock() {
        if let Some(task) = tasks.iter_mut().find(|item| item.id == task_id) {
            update(task);
        }
    }
}

pub fn register_downloaded_model(
    app: &AppHandle,
    option: &ModelDownloadOption,
    target_path: &PathBuf,
) -> Result<(), String> {
    let mut settings = crate::storage::settings::read_runtime_settings(app)?;
    settings.models.retain(|model| model.id != option.id);
    let tokenizer_repo = models::download::tokenizer_repo_for_option(option);
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
        file: Some(models::download::download_filename(option)),
        tokenizer_repo,
    });
    crate::storage::settings::write_runtime_settings(app, &settings)
}

fn read_import_jobs(app: &AppHandle) -> Result<Vec<ImportJob>, String> {
    let path = models::resolve::import_jobs_path(app)?;
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

fn write_import_jobs(app: &AppHandle, jobs: &[ImportJob]) -> Result<(), String> {
    models::resolve::write_json(&models::resolve::import_jobs_path(app)?, jobs)
}

fn upsert_imported_skill(app: &AppHandle, skill: AgentSkill) -> Result<AgentSkill, String> {
    let normalized = crate::agent::skill::normalize_skill(skill);
    let mut skills = crate::agent::skill::read_skills(app)?
        .into_iter()
        .map(crate::agent::skill::normalize_skill)
        .collect::<Vec<_>>();
    skills.retain(|existing| existing.id != normalized.id);
    skills.push(normalized.clone());
    crate::agent::skill::write_skills(app, &skills)?;
    Ok(normalized)
}

fn create_skill_import_dir(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let slug = crate::agent::skill::slugify(name);
    let dir = models::resolve::skill_packages_dir(app)?
        .join(format!("{}-{}", slug, models::download::now_stamp()));
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn write_imported_files(dir: &PathBuf, files: &[SkillImportFile]) -> Result<(), String> {
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

fn extract_zip_archive(bytes: &[u8], output_dir: &PathBuf) -> Result<(), String> {
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
        std::io::Read::read_to_end(&mut file, &mut buffer).map_err(|error| error.to_string())?;
        fs::write(output, buffer).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn find_skill_root(dir: &PathBuf) -> Result<Option<PathBuf>, String> {
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

fn find_skill_root_recursive(dir: &PathBuf, depth: usize) -> Result<Option<PathBuf>, String> {
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

fn decode_base64_bytes(value: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.decode(value).map_err(|error| error.to_string())
}

fn sanitize_relative_path(value: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::Normal(part) => clean.push(part),
            std::path::Component::CurDir => {}
            _ => return Err(format!("非法路径: {}", value)),
        }
    }
    if clean.as_os_str().is_empty() {
        return Err("空路径无效".to_string());
    }
    Ok(clean)
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
    value
        .chars()
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