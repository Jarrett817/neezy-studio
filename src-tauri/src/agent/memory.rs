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
    let conn = crate::storage::db::open_memory_db(app)?;
    let mut stmt = conn.prepare("SELECT id, title, content, category, updated_at FROM knowledge_items ORDER BY updated_at DESC, created_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok(KnowledgeItem {
        id: Some(row.get(0)?),
        title: row.get(1)?,
        content: row.get(2)?,
        category: row.get(3)?,
        updated_at: Some(row.get(4)?),
    })).map_err(|e| e.to_string())?;
    let items = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    if !items.is_empty() {
        return Ok(items);
    }
    let path = knowledge_items_path(app)?;
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

pub fn upsert_knowledge_item(app: &AppHandle, item: &KnowledgeItem) -> Result<(), String> {
    let conn = crate::storage::db::open_memory_db(app)?;
    let now = crate::models::resolve::now_stamp();
    let id = item.id.clone().unwrap_or_else(|| format!("knowledge-{}", now.clone()));
    conn.execute(
        "INSERT INTO knowledge_items (id, title, content, category, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           content = excluded.content,
           category = excluded.category,
           updated_at = excluded.updated_at",
        params![id, item.title, item.content, item.category, now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_relevant_knowledge(app: &AppHandle, topic: &str, goal: &str, _references: &str) -> Result<Vec<KnowledgeItem>, String> {
    let items = read_knowledge_items(app)?;
    let query = format!("{} {}", topic, goal).to_lowercase();
    let mut scored = items.into_iter().map(|item| {
        let text = format!("{} {} {}", item.title, item.category, item.content).to_lowercase();
        let score = keyword_match_score(&query, &text);
        (item, score)
    }).collect::<Vec<_>>();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(8);
    Ok(scored.into_iter().map(|s| s.0).collect())
}

fn keyword_match_score(query: &str, text: &str) -> f32 {
    let query_words: Vec<&str> = query.split_whitespace().collect();
    let text_words: Vec<&str> = text.split_whitespace().collect();
    let matches = query_words.iter().filter(|w| text.contains(*w)).count();
    matches as f32 / query_words.len().max(1) as f32
}