use rusqlite::params;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeItem {
    pub id: Option<String>,
    pub title: String,
    pub content: String,
    pub category: String,
    #[serde(default)]
    pub updated_at: Option<String>,
}

pub fn knowledge_items_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::storage::settings::app_data_dir(app)?.join("knowledge-items.json"))
}

pub fn read_knowledge_items(app: &AppHandle) -> Result<Vec<KnowledgeItem>, String> {
    let connection = crate::storage::db::open_memory_db(app)?;
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

    let raw = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

pub fn upsert_knowledge_item(app: &AppHandle, item: &KnowledgeItem) -> Result<(), String> {
    let connection = crate::storage::db::open_memory_db(app)?;
    let now = crate::models::resolve::now_stamp();
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
            params![id, item.title, item.content, item.category, now],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[derive(Clone)]
struct ScoredKnowledgeItem {
    item: KnowledgeItem,
    similarity: Option<f32>,
}

pub async fn retrieve_relevant_knowledge(
    app: &AppHandle,
    settings: &crate::storage::settings::RuntimeSettings,
    metrics: &crate::models::resolve::RuntimeMetrics,
    topic: &str,
    goal: &str,
    references: &str,
) -> Result<Vec<KnowledgeItem>, String> {
    let items = read_knowledge_items(app)?;
    if items.is_empty() {
        return Ok(Vec::new());
    }

    let embedding_model = select_embedding_model(settings);
    let embedding_model = match embedding_model {
        Some(m) => m,
        None => return Ok(keyword_knowledge(items, topic, goal, references)),
    };

    crate::agent::memory::ensure_knowledge_embeddings(app, settings, metrics, &items).await?;
    let query = format!("{}\n{}\n{}", topic, goal, references);
    let query_embedding = embed_texts(app, embedding_model, &query).await?;
    let query_vector = match query_embedding.embeddings.into_iter().next() {
        Some(v) => v,
        None => return Ok(keyword_knowledge(items, topic, goal, references)),
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
    Ok(scored.into_iter().map(|s| s.item).collect())
}

fn select_embedding_model(
    settings: &crate::storage::settings::RuntimeSettings,
) -> Option<&crate::models::resolve::ModelConfig> {
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

fn keyword_knowledge(
    items: Vec<KnowledgeItem>,
    topic: &str,
    goal: &str,
    references: &str,
) -> Vec<KnowledgeItem> {
    let query = format!("{} {} {}", topic, goal, references).to_lowercase();
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
    scored.into_iter().map(|s| s.item).collect()
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

#[derive(Clone)]
struct EmbeddingRecord {
    owner_id: String,
    vector: Vec<f32>,
}

fn read_embedding_owner_ids(app: &AppHandle, model_id: &str) -> Result<Vec<String>, String> {
    let connection = crate::storage::db::open_memory_db(app)?;
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
    let connection = crate::storage::db::open_memory_db(app)?;
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
    let connection = crate::storage::db::open_memory_db(app)?;
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
                crate::models::resolve::now_stamp()
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub async fn ensure_knowledge_embeddings(
    app: &AppHandle,
    settings: &crate::storage::settings::RuntimeSettings,
    _metrics: &crate::models::resolve::RuntimeMetrics,
    items: &[KnowledgeItem],
) -> Result<(), String> {
    let model = match select_embedding_model(settings) {
        Some(m) => m,
        None => return Ok(()),
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
    let output = embed_texts(app, model, &texts.join("\n---\n")).await?;
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

fn knowledge_embedding_text(item: &KnowledgeItem) -> String {
    format!(
        "title: {}\ncategory: {}\ncontent: {}",
        item.title, item.category, item.content
    )
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingSidecarOutput {
    pub model_id: String,
    pub dimension: usize,
    pub embeddings: Vec<Vec<f32>>,
}

pub async fn embed_texts(
    _app: &AppHandle,
    model: &crate::models::resolve::ModelConfig,
    text: &str,
) -> Result<EmbeddingSidecarOutput, String> {
    let embeddings = crate::llm::embed_texts(
        crate::llm::RuntimeModel {
            path: model.path.clone(),
            file: model.file.clone(),
            tokenizer_repo: model.tokenizer_repo.clone(),
        },
        vec![text.to_string()],
    )
    .await?;
    let dimension = embeddings.first().map(Vec::len).unwrap_or(0);
    Ok(EmbeddingSidecarOutput {
        model_id: model.id.clone(),
        dimension,
        embeddings,
    })
}
