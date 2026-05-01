pub mod model;
pub mod tokenizer;

use crate::LlmMessage;
use candle_core::{Device, Tensor};
use candle_transformers::generation::{LogitsProcessor, Sampling};
use std::collections::HashMap;
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, OnceLock,
};
use tauri::{AppHandle, Emitter};
use tokenizers::Tokenizer;

#[derive(Clone)]
pub struct RuntimeModel {
    pub path: String,
    pub file: Option<String>,
    pub tokenizer_repo: Option<String>,
}

enum ModelType {
    Llama(Arc<Mutex<candle_transformers::models::quantized_llama::ModelWeights>>),
    Qwen2(Arc<Mutex<candle_transformers::models::quantized_qwen2::ModelWeights>>),
    Qwen3(Arc<Mutex<candle_transformers::models::quantized_qwen3::ModelWeights>>),
}

struct ModelInstance {
    model_type: ModelType,
    device: Device,
    tokenizer: Tokenizer,
}

static MODEL_CACHE: OnceLock<Mutex<HashMap<String, Arc<Mutex<ModelInstance>>>>> = OnceLock::new();
static CANCEL_GENERATION: AtomicBool = AtomicBool::new(false);

pub fn preload_model_task(
    model_path: String,
    model_file: Option<String>,
    tokenizer_repo: Option<String>,
    _use_gpu: bool,
) {
    let Some(cache_key) = resolve_model_source(&RuntimeModel {
        path: model_path.clone(),
        file: model_file.clone(),
        tokenizer_repo: tokenizer_repo.clone(),
    })
    .ok() else {
        return;
    };
    if cached_model(&cache_key).is_some() {
        return;
    }
    let tokenizer_repo_clone = tokenizer_repo.clone();
    let _handle = tauri::async_runtime::spawn(async move {
        match load_model_instance(&cache_key, tokenizer_repo_clone.as_deref()) {
            Ok(_) => log::info!("preloaded model: {}", cache_key),
            Err(e) => log::warn!("preload model failed: {}", e),
        }
    });
}

pub async fn generate_text_stream(
    app: AppHandle,
    model: RuntimeModel,
    messages: Vec<LlmMessage>,
    runtime: serde_json::Value,
    max_tokens: usize,
    stream_tokens: bool,
    _image_path: Option<String>,
) -> Result<String, String> {
    CANCEL_GENERATION.store(false, Ordering::SeqCst);
    let cache_key = resolve_model_source(&model)?;
    emit_status(
        &app,
        "loading-model",
        &format!("加载本地模型 {}", PathBuf::from(&model.path).display()),
    );
    if is_cancelled(&app) {
        return Ok(String::new());
    }

    let temperature = runtime
        .get("temperature")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.7) as f64;
    let repeat_penalty = runtime
        .get("repeatPenalty")
        .and_then(|v| v.as_f64())
        .unwrap_or(1.1) as f32;
    let model_arc = load_model_instance(&cache_key, model.tokenizer_repo.as_deref())?;
    if is_cancelled(&app) {
        return Ok(String::new());
    }

    emit_status(&app, "preparing-request", "准备提示词");
    let prompt = build_prompt(&messages);
    if is_cancelled(&app) {
        return Ok(String::new());
    }

    emit_status(&app, "starting-inference", "模型开始推理");
    let max_tokens = if max_tokens == 0 { 2048 } else { max_tokens };

    let tokens = {
        let guard = model_arc.lock().map_err(|e| e.to_string())?;
        guard
            .tokenizer
            .encode(prompt.as_str(), true)
            .map_err(|e| format!("tokenizer error: {}", e))?
            .get_ids()
            .to_vec()
    };
    if tokens.is_empty() {
        return Err("failed to tokenize prompt".to_string());
    }

    let mut all_tokens = Vec::new();
    let mut logits_processor = LogitsProcessor::from_sampling(
        299792458,
        if temperature <= 0. {
            Sampling::ArgMax
        } else {
            Sampling::All { temperature }
        },
    );
    let mut token_stream = String::new();
    let eos_token = {
        let guard = model_arc.lock().map_err(|e| e.to_string())?;
        guard.tokenizer.get_vocab(true).get("</s>").copied()
    };

    let first_logits = {
        let guard = model_arc.lock().map_err(|e| e.to_string())?;
        let initial_input = Tensor::new(tokens.as_slice(), &guard.device)
            .map_err(|e| e.to_string())?
            .unsqueeze(0)
            .map_err(|e| e.to_string())?;
        match &guard.model_type {
            ModelType::Llama(m) => m.lock().unwrap().forward(&initial_input, 0),
            ModelType::Qwen2(m) => m.lock().unwrap().forward(&initial_input, 0),
            ModelType::Qwen3(m) => m.lock().unwrap().forward(&initial_input, 0),
        }
        .map_err(|e| e.to_string())?
    };
    let logits = first_logits.squeeze(0).map_err(|e| e.to_string())?;
    let mut next_token = logits_processor
        .sample(&logits)
        .map_err(|e| e.to_string())?;

    if let Some(t) = {
        let guard = model_arc.lock().map_err(|e| e.to_string())?;
        decode_token(&guard.tokenizer, next_token)
    } {
        token_stream.push_str(&t);
        if stream_tokens {
            let _ = app.emit(
                "content-agent-event",
                serde_json::json!({ "type": "token", "text": t }),
            );
        }
    }
    all_tokens.push(next_token);

    for index in 0..max_tokens {
        if is_cancelled(&app) {
            break;
        }
        let logits = {
            let guard = model_arc.lock().map_err(|e| e.to_string())?;
            let input = Tensor::new(&[next_token], &guard.device)
                .map_err(|e| e.to_string())?
                .unsqueeze(0)
                .map_err(|e| e.to_string())?;
            match &guard.model_type {
                ModelType::Llama(m) => m.lock().unwrap().forward(&input, tokens.len() + index),
                ModelType::Qwen2(m) => m.lock().unwrap().forward(&input, tokens.len() + index),
                ModelType::Qwen3(m) => m.lock().unwrap().forward(&input, tokens.len() + index),
            }
            .map_err(|e| e.to_string())?
        };
        let logits = logits.squeeze(0).map_err(|e| e.to_string())?;
        let logits = if repeat_penalty == 1. {
            logits
        } else {
            let start_at = all_tokens.len().saturating_sub(64);
            candle_transformers::utils::apply_repeat_penalty(
                &logits,
                repeat_penalty,
                &all_tokens[start_at..],
            )
            .map_err(|e| format!("repeat penalty error: {}", e))?
        };
        next_token = logits_processor
            .sample(&logits)
            .map_err(|e| e.to_string())?;
        if let Some(t) = {
            let guard = model_arc.lock().map_err(|e| e.to_string())?;
            decode_token(&guard.tokenizer, next_token)
        } {
            token_stream.push_str(&t);
            if stream_tokens {
                let _ = app.emit(
                    "content-agent-event",
                    serde_json::json!({ "type": "token", "text": t }),
                );
            }
        }
        all_tokens.push(next_token);
        if eos_token == Some(next_token) {
            break;
        }
    }
    Ok(token_stream)
}

fn detect_model_type(path: &PathBuf) -> Result<&'static str, String> {
    let file = File::open(path).map_err(|e| format!("failed to open model: {}", e))?;
    let mut reader = BufReader::new(file);
    let gguf = candle_core::quantized::gguf_file::Content::read(&mut reader)
        .map_err(|e| format!("failed to read GGUF: {}", e))?;
    if gguf.metadata.contains_key("qwen3.embedding_length") {
        return Ok("qwen3");
    }
    if gguf.metadata.contains_key("qwen2.embedding_length") {
        return Ok("qwen2");
    }
    if gguf.metadata.contains_key("llama.embedding_length") {
        return Ok("llama");
    }
    if gguf.metadata.contains_key("gemma.embedding_length") {
        return Ok("gemma");
    }
    log::warn!(
        "available metadata keys: {:?}",
        gguf.metadata.keys().collect::<Vec<_>>()
    );
    Err("cannot determine model architecture from GGUF file".to_string())
}

fn load_model_instance(
    cache_key: &str,
    tokenizer_repo: Option<&str>,
) -> Result<Arc<Mutex<ModelInstance>>, String> {
    if let Some(instance) = cached_model(cache_key) {
        return Ok(instance);
    }
    let path = PathBuf::from(cache_key);
    let device = Device::cuda_if_available(0).unwrap_or(Device::Cpu);

    let file = File::open(&path).map_err(|e| format!("failed to open model: {}", e))?;
    let mut reader = BufReader::new(file);
    let gguf = candle_core::quantized::gguf_file::Content::read(&mut reader)
        .map_err(|e| format!("failed to read GGUF: {}", e))?;

    let mut total_size = 0usize;
    for (_, tensor) in gguf.tensor_infos.iter() {
        let elem_count = tensor.shape.elem_count();
        total_size += elem_count * tensor.ggml_dtype.type_size() / tensor.ggml_dtype.block_size();
    }
    log::info!(
        "loaded {} tensors ({:.2}GB)",
        gguf.tensor_infos.len(),
        total_size as f64 / 1e9
    );

    let model_type_str = detect_model_type(&path)?;
    log::info!("detected model type: {}", model_type_str);
    let mut reader =
        BufReader::new(File::open(&path).map_err(|e| format!("failed to reopen: {}", e))?);
    let model_type = match model_type_str {
        "qwen3" => ModelType::Qwen3(Arc::new(Mutex::new(
            candle_transformers::models::quantized_qwen3::ModelWeights::from_gguf(
                gguf,
                &mut reader,
                &device,
            )
            .map_err(|e| format!("failed to load qwen3 model: {}", e))?,
        ))),
        "qwen2" => ModelType::Qwen2(Arc::new(Mutex::new(
            candle_transformers::models::quantized_qwen2::ModelWeights::from_gguf(
                gguf,
                &mut reader,
                &device,
            )
            .map_err(|e| format!("failed to load qwen2 model: {}", e))?,
        ))),
        "llama" => ModelType::Llama(Arc::new(Mutex::new(
            candle_transformers::models::quantized_llama::ModelWeights::from_gguf(
                gguf,
                &mut reader,
                &device,
            )
            .map_err(|e| format!("failed to load llama model: {}", e))?,
        ))),
        _ => return Err(format!("unsupported model type: {}", model_type_str)),
    };

    let tokenizer = tokenizer::load_tokenizer(tokenizer_repo, &path)?;
    let instance = Arc::new(Mutex::new(ModelInstance {
        model_type,
        device,
        tokenizer,
    }));
    let _ = cache_model(cache_key.to_string(), Arc::clone(&instance));
    Ok(instance)
}

fn resolve_model_source(model: &RuntimeModel) -> Result<String, String> {
    let path = PathBuf::from(&model.path);
    if !path.exists() {
        return Err(format!("model path does not exist: {}", model.path));
    }
    if path.is_file() {
        Ok(path.to_string_lossy().to_string())
    } else if path.is_dir() {
        let file = model
            .file
            .clone()
            .ok_or_else(|| "model file name is missing".to_string())?;
        Ok(PathBuf::from(&model.path)
            .join(file)
            .to_string_lossy()
            .to_string())
    } else {
        Err(format!("model path does not exist: {}", model.path))
    }
}

fn cached_model(key: &str) -> Option<Arc<Mutex<ModelInstance>>> {
    MODEL_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .ok()?
        .get(key)
        .map(|arc| Arc::clone(arc))
}
fn cache_model(key: String, model: Arc<Mutex<ModelInstance>>) -> Result<(), String> {
    MODEL_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|e| e.to_string())?
        .insert(key, model);
    Ok(())
}

fn build_prompt(messages: &[LlmMessage]) -> String {
    let mut prompt = String::new();
    for msg in messages {
        match msg.role.as_str() {
            "system" => prompt.push_str(&format!("<|system|>\n{}<|end|>\n", msg.content)),
            "user" => prompt.push_str(&format!("<|user|>\n{}<|end|>\n", msg.content)),
            "assistant" => prompt.push_str(&format!("<|assistant|>\n{}<|end|>\n", msg.content)),
            "tool" => prompt.push_str(&format!("<|tool|>\n{}<|end|>\n", msg.content)),
            _ => prompt.push_str(&format!("{}: {}\n", msg.role, msg.content)),
        }
    }
    prompt.push_str("<|assistant|>\n");
    prompt
}

fn decode_token(tokenizer: &Tokenizer, token: u32) -> Option<String> {
    tokenizer
        .decode(&[token], true)
        .ok()
        .map(|s| s.replace("▁", " "))
        .filter(|s| !s.is_empty() && s != "<unk>" && s != "<pad>")
}
pub fn cancel_generation() {
    CANCEL_GENERATION.store(true, Ordering::SeqCst);
}
fn is_cancelled(app: &AppHandle) -> bool {
    let cancelled = CANCEL_GENERATION.load(Ordering::SeqCst);
    if cancelled {
        emit_status(app, "cancelled", "已停止本轮推理");
    }
    cancelled
}
fn emit_status(app: &AppHandle, phase: &str, message: &str) {
    let _ = app.emit(
        "content-agent-event",
        serde_json::json!({ "type": "status", "phase": phase, "message": message }),
    );
}

pub async fn embed_texts(
    _model: RuntimeModel,
    texts: Vec<String>,
) -> Result<Vec<Vec<f32>>, String> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }
    Ok(texts.iter().map(|_| vec![0.0f32; 768]).collect())
}
