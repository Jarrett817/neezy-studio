use rusqlite::{params, Connection, Result};
use std::path::PathBuf;
use tauri::AppHandle;

pub struct AccountProfile {
    pub account_name: String,
    pub track: String,
    pub persona: String,
    pub tone_style: String,
    pub forbidden_words: String,
}

pub fn open_memory_db(app: &AppHandle) -> Result<Connection, String> {
    let db_path = crate::storage::settings::app_data_dir(app)?.join("neezy-memory.sqlite");
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    init_schema(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS knowledge_items (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS memory_events (
            id TEXT PRIMARY KEY,
            layer TEXT NOT NULL,
            content TEXT NOT NULL,
            source TEXT,
            created_at TEXT NOT NULL
        )",
        [],
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS account_profile (
            id INTEGER PRIMARY KEY,
            account_name TEXT NOT NULL,
            track TEXT NOT NULL,
            persona TEXT NOT NULL,
            tone_style TEXT NOT NULL,
            forbidden_words TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn read_account_profile(app: &AppHandle) -> Result<AccountProfile, String> {
    let conn = open_memory_db(app)?;
    let mut stmt = conn.prepare("SELECT account_name, track, persona, tone_style, forbidden_words FROM account_profile WHERE id = 1").map_err(|e| e.to_string())?;
    let result = stmt.query_row([], |row| Ok(AccountProfile {
        account_name: row.get(0)?,
        track: row.get(1)?,
        persona: row.get(2)?,
        tone_style: row.get(3)?,
        forbidden_words: row.get(4)?,
    }));
    match result {
        Ok(profile) => Ok(profile),
        Err(_) => Ok(AccountProfile {
            account_name: "".to_string(),
            track: "".to_string(),
            persona: "".to_string(),
            tone_style: "".to_string(),
            forbidden_words: "".to_string(),
        }),
    }
}

pub fn write_account_profile(app: &AppHandle, profile: &AccountProfile) -> Result<(), String> {
    let conn = open_memory_db(app)?;
    let now = crate::models::resolve::now_stamp();
    conn.execute(
        "INSERT INTO account_profile (id, account_name, track, persona, tone_style, forbidden_words, updated_at)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
           account_name = excluded.account_name,
           track = excluded.track,
           persona = excluded.persona,
           tone_style = excluded.tone_style,
           forbidden_words = excluded.forbidden_words,
           updated_at = excluded.updated_at",
        params![profile.account_name, profile.track, profile.persona, profile.tone_style, profile.forbidden_words, now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}