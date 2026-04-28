use crate::LlmMessage;
use mistralrs::{EmbeddingRequest, GgufModelBuilder, Model, RequestBuilder, Response, TextMessageRole};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, OnceLock,
};
use tauri::{AppHandle, Emitter};

#[derive(Clone)]
pub struct RuntimeModel {
    pub path: String,
    pub repo: Option<String>,
    pub file: Option<String>,
    pub tokenizer_repo: Option<String>,
}

static MODEL_CACHE: OnceLock<Mutex<HashMap<String, Arc<Model>>>> = OnceLock::new();
static CANCEL_GENERATION: AtomicBool = AtomicBool::new(false);

pub async fn generate_text_stream(
    app: AppHandle,
    model: RuntimeModel,
    messages: Vec<LlmMessage>,
    _runtime: serde_json::Value,
    max_tokens: usize,
    stream_tokens: bool,
    image_path: Option<String>,
) -> Result<String, String> {
    CANCEL_GENERATION.store(false, Ordering::SeqCst);
    let (model_id, file) = resolve_model_source(&model, false)?;
    let cache_key = format!("text::{model_id}::{file}::{:?}", model.tokenizer_repo);

    let loaded = if let Some(model) = cached_model(&cache_key)? {
        model
    } else {
        let mut builder = GgufModelBuilder::new(model_id, vec![file]).with_force_cpu();
        if let Some(tokenizer_repo) = model.tokenizer_repo.clone() {
            builder = builder.with_tok_model_id(tokenizer_repo);
        }
        let loaded = Arc::new(
            builder
                .build()
                .await
                .map_err(|error| format!("mistral.rs failed to load model: {error}"))?,
        );
        cache_model(cache_key, loaded.clone())?;
        loaded
    };

    let mut request = RequestBuilder::new().set_sampler_max_len(max_tokens);
    let mut image_attached = false;
    for message in messages {
        if !image_attached && message.role == "user" {
            if let Some(path) = image_path.as_deref().filter(|value| !value.trim().is_empty()) {
                let image = image::open(path)
                    .map_err(|error| format!("failed to open image `{path}`: {error}"))?;
                request =
                    request.add_image_message(parse_role(&message.role), message.content, vec![image]);
                image_attached = true;
                continue;
            }
        }
        request = request.add_message(parse_role(&message.role), message.content);
    }

    let mut stream = loaded
        .stream_chat_request(request)
        .await
        .map_err(|error| format!("mistral.rs failed to start streaming: {error}"))?;

    let mut full_text = String::new();
    while let Some(chunk) = stream.next().await {
        if CANCEL_GENERATION.load(Ordering::SeqCst) {
            break;
        }
        if let Response::Chunk(chunk) = chunk {
            if let Some(text) = chunk
                .choices
                .first()
                .and_then(|choice| choice.delta.content.as_ref())
            {
                full_text.push_str(text);
                if stream_tokens {
                    let _ = app.emit(
                        "content-agent-event",
                        serde_json::json!({
                            "type": "token",
                            "text": text
                        }),
                    );
                }
            }
        }
    }

    Ok(full_text)
}

pub async fn embed_texts(model: RuntimeModel, texts: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }

    let (model_id, file) = resolve_model_source(&model, true)?;
    let loaded = GgufModelBuilder::new(model_id, vec![file])
        .with_force_cpu()
        .build()
        .await
        .map_err(|error| format!("mistral.rs failed to load embedding model: {error}"))?;

    loaded
        .generate_embeddings(EmbeddingRequest::builder().add_prompts(texts))
        .await
        .map_err(|error| format!("mistral.rs embedding failed: {error}"))
}

pub fn cancel_generation() {
    CANCEL_GENERATION.store(true, Ordering::SeqCst);
}

fn cached_model(key: &str) -> Result<Option<Arc<Model>>, String> {
    MODEL_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|error| error.to_string())
        .map(|cache| cache.get(key).cloned())
}

fn cache_model(key: String, model: Arc<Model>) -> Result<(), String> {
    MODEL_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|error| error.to_string())?
        .insert(key, model);
    Ok(())
}

fn resolve_model_source(model: &RuntimeModel, embedding: bool) -> Result<(String, String), String> {
    if let (Some(repo), Some(file)) = (model.repo.clone(), model.file.clone()) {
        return Ok((repo, file));
    }

    let path = PathBuf::from(&model.path);
    if path.is_file() {
        let parent = path
            .parent()
            .and_then(Path::to_str)
            .map(|value| value.to_string())
            .ok_or_else(|| missing_parent_error(embedding))?;
        let file = path
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .ok_or_else(|| missing_filename_error(embedding))?;
        return Ok((parent, file));
    }

    if path.is_dir() {
        let file = model
            .file
            .clone()
            .ok_or_else(|| missing_filename_error(embedding))?;
        return Ok((model.path.clone(), file));
    }

    Err(format!("model path does not exist: {}", model.path))
}

fn missing_parent_error(embedding: bool) -> String {
    if embedding {
        "embedding model parent directory is missing".to_string()
    } else {
        "model parent directory is missing".to_string()
    }
}

fn missing_filename_error(embedding: bool) -> String {
    if embedding {
        "embedding model file name is missing".to_string()
    } else {
        "model file name is missing".to_string()
    }
}

fn parse_role(role: &str) -> TextMessageRole {
    match role {
        "system" => TextMessageRole::System,
        "assistant" => TextMessageRole::Assistant,
        "tool" => TextMessageRole::Tool,
        "user" => TextMessageRole::User,
        value => TextMessageRole::Custom(value.to_string()),
    }
}
