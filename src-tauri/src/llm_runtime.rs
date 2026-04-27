use crate::LlmMessage;
use mistralrs::{EmbeddingRequest, GgufModelBuilder, RequestBuilder, Response, TextMessageRole};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

#[derive(Clone)]
pub struct RuntimeModel {
    pub path: String,
    pub repo: Option<String>,
    pub file: Option<String>,
    pub tokenizer_repo: Option<String>,
}

pub async fn generate_text_stream(
    app: AppHandle,
    model: RuntimeModel,
    messages: Vec<LlmMessage>,
    _runtime: serde_json::Value,
    max_tokens: usize,
    stream_tokens: bool,
) -> Result<String, String> {
    let (model_id, file) = resolve_model_source(&model, false)?;

    let mut builder = GgufModelBuilder::new(model_id, vec![file]).with_force_cpu();
    if let Some(tokenizer_repo) = model.tokenizer_repo.clone() {
        builder = builder.with_tok_model_id(tokenizer_repo);
    }

    let loaded = builder
        .build()
        .await
        .map_err(|error| format!("mistral.rs failed to load model: {error}"))?;

    let mut request = RequestBuilder::new().set_sampler_max_len(max_tokens);
    for message in messages {
        request = request.add_message(parse_role(&message.role), message.content);
    }

    let mut stream = loaded
        .stream_chat_request(request)
        .await
        .map_err(|error| format!("mistral.rs failed to start streaming: {error}"))?;

    let mut full_text = String::new();
    while let Some(chunk) = stream.next().await {
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
