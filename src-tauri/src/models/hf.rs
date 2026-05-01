use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::Path;

#[derive(Clone, Serialize, Deserialize)]
pub struct HuggingFaceModel {
    pub id: String,
    pub author: String,
    pub downloads: Option<u64>,
    pub likes: Option<u64>,
    pub tags: Vec<String>,
    pub last_modified: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct HuggingFaceFile {
    pub path: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HfModelListResult {
    pub models: Vec<HuggingFaceModel>,
    pub total: usize,
    pub page: usize,
    pub page_size: usize,
    pub total_pages: usize,
}

fn parse_hf_date(s: &str) -> Option<String> {
    if s.len() >= 10 {
        Some(s[..10].to_string())
    } else {
        None
    }
}

#[derive(Deserialize)]
struct HFApiModel {
    id: String,
    downloads: Option<u64>,
    likes: Option<u64>,
    tags: Option<Vec<String>>,
    last_modified: Option<String>,
}

pub fn list_models(
    search: Option<&str>,
    sort: Option<&str>,
    page: usize,
    page_size: usize,
) -> Result<HfModelListResult, String> {
    let sort = sort.unwrap_or("downloads");
    let start = (page - 1) * page_size;

    let search_query = search.unwrap_or("").trim();

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    // First, get total count
    let count_url = if search_query.is_empty() {
        format!(
            "https://hf-mirror.com/api/models?filter=gguf&sort={}&direction=-1&limit=1",
            sort
        )
    } else {
        format!(
            "https://hf-mirror.com/api/models?filter=gguf&search={}&sort={}&direction=-1&limit=1",
            search_query.replace(" ", "%20"),
            sort
        )
    };

    let total = if let Ok(response) = client.get(&count_url)
        .header("User-Agent", "NeezyStudio/0.1")
        .send() {
        // Get headers and text before processing
        let x_total = response.headers()
            .get("x-total")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let text = response.text().unwrap_or_default();

        // If API returns HTML or wrapped JSON, parse Count from JSON response wrapper
        if text.starts_with('<') || (text.starts_with('{') && !text.contains("\"value\"")) {
            serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| v.get("Count").and_then(|c| c.as_u64()))
                .map(|c| c as usize)
                .unwrap_or(if x_total > 0 { x_total } else { 5000 })
        } else if x_total > 0 {
            x_total
        } else {
            5000
        }
    } else {
        5000
    };

    // Fetch page of models
    let url = if search_query.is_empty() {
        format!(
            "https://hf-mirror.com/api/models?filter=gguf&sort={}&direction=-1&limit={}&offset={}",
            sort, page_size, start
        )
    } else {
        format!(
            "https://hf-mirror.com/api/models?filter=gguf&search={}&sort={}&direction=-1&limit={}&offset={}",
            search_query.replace(" ", "%20"),
            sort,
            page_size,
            start
        )
    };

    let response = client.get(&url)
        .header("User-Agent", "NeezyStudio/0.1")
        .send()
        .map_err(|e| e.to_string())?;
    let text = response.text().map_err(|e| e.to_string())?;

    if text.starts_with('<') {
        return Err(format!("API returned HTML error page, URL: {}", url));
    }

    let models: Vec<HFApiModel> = serde_json::from_str(&text)
        .map_err(|e| format!("parse error: {} - response: {}", e, &text[..text.len().min(500)]))?;

    let result = models.into_iter().map(|m| {
        let author = m.id.split('/').next().unwrap_or("unknown").to_string();
        let tags = m.tags.unwrap_or_default();
        let last_modified = m.last_modified.as_ref().and_then(|s| parse_hf_date(s));
        HuggingFaceModel {
            id: m.id,
            author,
            downloads: m.downloads,
            likes: m.likes,
            tags,
            last_modified,
        }
    }).collect();

    let total_pages = (total as f64 / page_size as f64).ceil() as usize;

    Ok(HfModelListResult {
        models: result,
        total,
        page,
        page_size,
        total_pages,
    })
}

pub fn list_repo_files(repo_id: &str) -> Result<Vec<HuggingFaceFile>, String> {
    std::env::set_var("HF_ENDPOINT", "https://hf-mirror.com");
    let api = hf_hub::api::sync::Api::new().map_err(|e| e.to_string())?;
    let repo_api = api.model(repo_id.to_string());
    let info = repo_api.info().map_err(|e| e.to_string())?;

    let files = info
        .siblings
        .into_iter()
        .filter(|f| {
            let name = f.rfilename.to_lowercase();
            !name.ends_with(".txt") && !name.ends_with(".md") && !name.contains("readme") && (name.ends_with(".gguf") || name.ends_with(".bin"))
        })
        .map(|f| HuggingFaceFile { path: f.rfilename })
        .collect();

    Ok(files)
}

pub fn download_model_file(
    repo_id: &str,
    file_path: &str,
    target_path: &Path,
    on_progress: impl Fn(u64, Option<u64>),
) -> Result<(), String> {
    std::env::set_var("HF_ENDPOINT", "https://hf-mirror.com");
    let api = hf_hub::api::sync::Api::new().map_err(|e| e.to_string())?;
    let repo_api = api.model(repo_id.to_string());

    let source = repo_api.get(file_path).map_err(|e| e.to_string())?;
    let source_size = std::fs::metadata(&source).map(|m| m.len()).unwrap_or(0);

    let temp_path = target_path.with_extension("download");

    let mut file = std::fs::File::create(&temp_path).map_err(|e| e.to_string())?;
    let mut source_file = std::fs::File::open(&source).map_err(|e| e.to_string())?;
    let mut buffer = vec![0u8; 65536];
    let mut downloaded = 0u64;

    loop {
        let n = source_file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        std::io::Write::write_all(&mut file, &buffer[..n]).map_err(|e| e.to_string())?;
        downloaded += n as u64;
        on_progress(downloaded, Some(source_size));
    }

    std::fs::rename(&temp_path, target_path).map_err(|e| e.to_string())
}