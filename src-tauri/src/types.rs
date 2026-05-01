use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmMessage {
    pub role: String,
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentAgentInput {
    pub topic: String,
    pub goal: String,
    pub references: String,
    pub model_path: Option<String>,
    pub model_id: Option<String>,
    pub image_path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildInfo {
    pub app_name: String,
    pub app_version: String,
    pub target: String,
    pub profile: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummary {
    pub draft_count: u32,
    pub ready_to_publish_count: u32,
    pub knowledge_count: u32,
    pub weekly_post_count: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub summary: DashboardSummary,
    pub drafts: Vec<DraftPreview>,
    pub knowledge: Vec<KnowledgePreview>,
    pub metrics: Vec<MetricPoint>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftPreview {
    pub id: String,
    pub title: String,
    pub status: String,
    pub updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgePreview {
    pub id: String,
    pub title: String,
    pub category: String,
    pub content: String,
    pub last_used_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricPoint {
    pub label: String,
    pub views: u32,
    pub saves: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePlan {
    pub max_threads: usize,
    pub context_size: usize,
    pub batch_size: usize,
    pub gpu: serde_json::Value,
    pub cpu_limit_percent: u8,
    pub pressure: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportJob {
    pub id: String,
    pub source_url: String,
    pub stage: JobStage,
    pub created_at: String,
    pub updated_at: String,
    pub note_id: String,
    pub insight: Option<String>,
    pub extracted: Option<ExtractedImport>,
    pub error_message: Option<String>,
}

#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum JobStage {
    Queued,
    Screenshot,
    Extract,
    Understand,
    Done,
    Failed,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedImport {
    pub author: String,
    pub title: String,
    pub likes: u32,
    pub saves: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillImportFile {
    pub relative_path: String,
    pub bytes_base64: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePastedImageInput {
    pub file_name: Option<String>,
    pub mime_type: String,
    pub bytes_base64: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEventInput {
    pub layer: String,
    pub content: String,
    pub source: Option<String>,
}

impl BuildInfo {
    pub fn new() -> Self {
        BuildInfo {
            app_name: "Neezy Studio".to_string(),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            target: std::env::consts::OS.to_string(),
            profile: if cfg!(debug_assertions) {
                "debug".to_string()
            } else {
                "release".to_string()
            },
        }
    }
}

impl Default for BuildInfo {
    fn default() -> Self {
        Self::new()
    }
}

impl WorkspaceSnapshot {
    pub fn new(knowledge_count: u32) -> Self {
        WorkspaceSnapshot {
            summary: DashboardSummary {
                draft_count: 0,
                ready_to_publish_count: 0,
                knowledge_count,
                weekly_post_count: 0,
            },
            drafts: Vec::new(),
            knowledge: Vec::new(),
            metrics: Vec::new(),
        }
    }
}