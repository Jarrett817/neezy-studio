use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use tokenizers::decoders::{byte_level::ByteLevel as ByteLevelDecoder, DecoderWrapper};
use tokenizers::models::bpe::{Vocab, BPE};
use tokenizers::pre_tokenizers::{
    byte_level::ByteLevel as ByteLevelPre,
    sequence::Sequence,
    split::{Split, SplitPattern},
    PreTokenizerWrapper,
};
use tokenizers::processors::{
    byte_level::ByteLevel as ByteLevelProcessor, template::TemplateProcessing, PostProcessorWrapper,
};
use tokenizers::tokenizer::Tokenizer;

pub fn load_tokenizer(
    tokenizer_repo: Option<&str>,
    model_path: &PathBuf,
) -> Result<Tokenizer, String> {
    // First check local tokenizer.json next to the model
    if let Some(parent) = model_path.parent() {
        let tokenizer_path = parent.join("tokenizer.json");
        if tokenizer_path.exists() {
            return Tokenizer::from_file(tokenizer_path)
                .map_err(|e| format!("failed to load tokenizer from file: {}", e));
        }
    }

    // Then try HuggingFace if repo is specified
    if let Some(repo) = tokenizer_repo {
        return load_tokenizer_from_hub(repo);
    }

    // Finally try GGUF embedded tokenizer
    load_tokenizer_from_gguf(model_path)
}

fn load_tokenizer_from_hub(repo: &str) -> Result<Tokenizer, String> {
    std::env::set_var("HF_ENDPOINT", "https://hf-mirror.com");
    let api = hf_hub::api::sync::Api::new().map_err(|e| e.to_string())?;
    let api = api.model(repo.to_string());
    let tokenizer_path = api.get("tokenizer.json").map_err(|e| e.to_string())?;
    Tokenizer::from_file(tokenizer_path).map_err(|e| format!("from_file error: {}", e))
}

fn load_tokenizer_from_gguf(model_path: &PathBuf) -> Result<Tokenizer, String> {
    let file = File::open(model_path).map_err(|e| format!("failed to open model: {}", e))?;
    let mut reader = BufReader::new(file);
    let ct =
        candle_core::quantized::gguf_file::Content::read(&mut reader).map_err(|e| e.to_string())?;

    let model_kind = metadata_str(&ct, "tokenizer.ggml.model")?;
    if model_kind != "gpt2" {
        return Err(format!("unsupported tokenizer model `{}`", model_kind));
    }

    let tokens = metadata_strings(&ct, "tokenizer.ggml.tokens")?;
    let vocab: Vocab = tokens
        .iter()
        .enumerate()
        .map(|(i, t)| (t.clone(), i as u32))
        .collect();
    let merges = metadata_merges(&ct, "tokenizer.ggml.merges")?;

    let mut builder = BPE::builder().vocab_and_merges(vocab, merges);
    if let Ok(token_id) = metadata_u32(&ct, "tokenizer.ggml.unk_token_id") {
        if let Some(token) = tokens.get(token_id as usize) {
            builder = builder.unk_token(token.clone());
        }
    }

    let bpe = builder
        .build()
        .map_err(|e| format!("BPE build error: {}", e))?;
    let mut tokenizer = Tokenizer::new(bpe);

    let pre = metadata_str(&ct, "tokenizer.ggml.pre").unwrap_or("gpt2".to_string());
    apply_pre_processor(&mut tokenizer, &pre);

    let add_bos = metadata_bool(&ct, "tokenizer.ggml.add_bos_token").unwrap_or(false);
    let add_eos = metadata_bool(&ct, "tokenizer.ggml.add_eos_token").unwrap_or(false);
    let bos_id = metadata_u32(&ct, "tokenizer.ggml.bos_token_id").ok();
    let eos_id = metadata_u32(&ct, "tokenizer.ggml.eos_token_id").ok();

    if add_bos || add_eos {
        apply_template_processor(&mut tokenizer, &tokens, bos_id, eos_id, add_bos, add_eos);
    }

    log::info!("loaded tokenizer from GGUF ({} tokens)", tokens.len());
    Ok(tokenizer)
}

fn metadata_str(
    ct: &candle_core::quantized::gguf_file::Content,
    key: &str,
) -> Result<String, String> {
    ct.metadata
        .get(key)
        .ok_or_else(|| format!("missing metadata key `{}`", key))?
        .to_string()
        .map_err(|e| format!("`{}` is not a string", key))
        .map(|s| s.clone())
}

fn metadata_strings(
    ct: &candle_core::quantized::gguf_file::Content,
    key: &str,
) -> Result<Vec<String>, String> {
    let arr = ct
        .metadata
        .get(key)
        .ok_or_else(|| format!("missing metadata key `{}`", key))?
        .to_vec()
        .map_err(|e| format!("`{}` is not an array", key))?;
    let mut tokens = Vec::new();
    for v in arr {
        let s = v
            .to_string()
            .map_err(|e| format!("array element is not a string: {:?}", e))?;
        tokens.push(s.clone());
    }
    Ok(tokens)
}

fn metadata_merges(
    ct: &candle_core::quantized::gguf_file::Content,
    key: &str,
) -> Result<Vec<(String, String)>, String> {
    let arr = ct
        .metadata
        .get(key)
        .ok_or_else(|| format!("missing metadata key `{}`", key))?
        .to_vec()
        .map_err(|e| format!("`{}` is not an array", key))?;
    let mut merges = Vec::new();
    for v in arr {
        let s = v
            .to_string()
            .map_err(|e| format!("merge element is not a string: {:?}", e))?;
        if let Some((a, b)) = s.split_once(' ') {
            merges.push((a.to_string(), b.to_string()));
        }
    }
    Ok(merges)
}

fn metadata_u32(ct: &candle_core::quantized::gguf_file::Content, key: &str) -> Result<u32, String> {
    ct.metadata
        .get(key)
        .ok_or_else(|| format!("missing metadata key `{}`", key))?
        .to_u32()
        .map_err(|e| format!("`{}` is not a u32: {}", key, e))
}

fn metadata_bool(
    ct: &candle_core::quantized::gguf_file::Content,
    key: &str,
) -> Result<bool, String> {
    ct.metadata
        .get(key)
        .ok_or_else(|| format!("missing metadata key `{}`", key))?
        .to_bool()
        .map_err(|e| format!("`{}` is not a bool: {}", key, e))
}

fn apply_pre_processor(tokenizer: &mut Tokenizer, pre: &str) {
    match pre {
        "qwen2" => {
            let regex = r"(?:'[sS]|'[tT]|'[rR][eE]|'[vV][eE]|'[mM]|'[lL][lL]|'[dD])|[^\r\n\p{L}\p{N}]?\p{L}+|\p{N}| ?[^\s\p{L}\p{N}]+[\r\n]*|\s*[\r\n]+|\s+(?!\S)|\s+";
            if let Ok(split) = Split::new(
                SplitPattern::Regex(regex.to_string()),
                tokenizers::tokenizer::SplitDelimiterBehavior::Isolated,
                false,
            ) {
                let seq = Sequence::new(vec![
                    PreTokenizerWrapper::Split(split),
                    PreTokenizerWrapper::ByteLevel(ByteLevelPre::new(false, false, false)),
                ]);
                tokenizer.with_pre_tokenizer(Some(seq));
            }
            tokenizer.with_decoder(Some(DecoderWrapper::ByteLevel(ByteLevelDecoder::new(
                false, false, false,
            ))));
            tokenizer.with_post_processor(Some(PostProcessorWrapper::ByteLevel(
                ByteLevelProcessor::new(false, false, false),
            )));
        }
        _ => {
            tokenizer.with_pre_tokenizer(Some(PreTokenizerWrapper::ByteLevel(
                ByteLevelPre::default(),
            )));
            tokenizer.with_decoder(Some(DecoderWrapper::ByteLevel(ByteLevelDecoder::default())));
            tokenizer.with_post_processor(Some(PostProcessorWrapper::ByteLevel(
                ByteLevelProcessor::default(),
            )));
        }
    }
}

fn apply_template_processor(
    tokenizer: &mut Tokenizer,
    tokens: &[String],
    bos_id: Option<u32>,
    eos_id: Option<u32>,
    add_bos: bool,
    add_eos: bool,
) {
    if (!add_bos && !add_eos) || tokens.is_empty() {
        return;
    }

    let mut specials = Vec::new();
    if add_bos {
        if let (Some(id), Some(tok)) = (bos_id, tokens.get(bos_id.unwrap_or(0) as usize)) {
            specials.push((tok.clone(), id));
        }
    }
    if add_eos {
        if let (Some(id), Some(tok)) = (eos_id, tokens.get(eos_id.unwrap_or(0) as usize)) {
            specials.push((tok.clone(), id));
        }
    }

    let mut single = Vec::new();
    if add_bos {
        if let Some(tok) = bos_id.and_then(|id| tokens.get(id as usize)) {
            single.push(tok.clone());
        }
    }
    single.push("$0".to_string());
    if add_eos {
        if let Some(tok) = eos_id.and_then(|id| tokens.get(id as usize)) {
            single.push(tok.clone());
        }
    }

    let mut pair = Vec::new();
    if add_bos {
        if let Some(tok) = bos_id.and_then(|id| tokens.get(id as usize)) {
            pair.push(format!("{}:0", tok));
        }
    }
    pair.push("$A:0".to_string());
    if add_eos {
        if let Some(tok) = eos_id.and_then(|id| tokens.get(id as usize)) {
            pair.push(format!("{}:0", tok));
        }
    }
    if add_bos {
        if let Some(tok) = bos_id.and_then(|id| tokens.get(id as usize)) {
            pair.push(format!("{}:1", tok));
        }
    }
    pair.push("$B:1".to_string());
    if add_eos {
        if let Some(tok) = eos_id.and_then(|id| tokens.get(id as usize)) {
            pair.push(format!("{}:1", tok));
        }
    }

    let proc = TemplateProcessing::builder()
        .try_single(single)
        .ok()
        .and_then(|b| b.try_pair(pair).ok())
        .and_then(|b| b.special_tokens(specials).build().ok());
    if let Some(proc) = proc {
        tokenizer.with_post_processor(Some(PostProcessorWrapper::Template(proc)));
    }
}
