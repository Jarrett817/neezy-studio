use rusqlite::{params, Connection, OptionalExtension};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn memory_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("neezy-memory.sqlite"))
}

pub fn open_memory_db(app: &AppHandle) -> Result<Connection, String> {
    let path = memory_db_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let connection = Connection::open(&path).map_err(|error| error.to_string())?;
    init_memory_db(&connection)?;
    Ok(connection)
}

pub fn init_memory_db(connection: &Connection) -> Result<(), String> {
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

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountProfile {
    pub account_name: String,
    pub track: String,
    pub persona: String,
    pub tone_style: String,
    pub forbidden_words: String,
}

pub fn read_account_profile(app: &AppHandle) -> Result<AccountProfile, String> {
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

    let path = crate::models::resolve::account_profile_path(app)?;
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

pub fn write_account_profile(app: &AppHandle, profile: &AccountProfile) -> Result<(), String> {
    let connection = open_memory_db(app)?;
    let now = crate::models::download::now_stamp();
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
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}
