use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSkill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub slug: String,
    pub source_kind: String,
    #[serde(default)]
    pub root_path: Option<String>,
    #[serde(default)]
    pub skill_md_path: Option<String>,
    pub instructions: String,
    pub prompt: String,
    pub enabled: bool,
    pub file_count: u32,
    pub has_scripts: bool,
    pub has_references: bool,
    pub has_assets: bool,
    #[serde(default)]
    pub updated_at: Option<String>,
}

pub fn read_skills(app: &AppHandle) -> Result<Vec<AgentSkill>, String> {
    let path = crate::models::resolve::skill_packages_dir(app)?.join("skills.json");
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

pub fn write_skills(app: &AppHandle, skills: &[AgentSkill]) -> Result<(), String> {
    let path = crate::models::resolve::skill_packages_dir(app)?.join("skills.json");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(skills).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| e.to_string())
}

pub fn normalize_skill(mut skill: AgentSkill) -> AgentSkill {
    if skill.slug.trim().is_empty() {
        skill.slug = slugify(&skill.name);
    }
    if skill.source_kind.trim().is_empty() {
        skill.source_kind = "legacy".to_string();
    }
    if skill.instructions.trim().is_empty() {
        skill.instructions = skill.prompt.clone();
    }
    if skill.prompt.trim().is_empty() {
        skill.prompt = first_nonempty_line(&skill.instructions);
    }
    if skill.updated_at.is_none() {
        skill.updated_at = Some(crate::models::resolve::now_stamp());
    }
    skill
}

pub fn slugify(name: &str) -> String {
    name.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c.to_ascii_lowercase() } else { '-' }).collect::<String>().trim_matches('-').to_string()
}

fn first_nonempty_line(s: &str) -> String {
    s.lines().find(|l| !l.trim().is_empty()).map(|l| l.trim().to_string()).unwrap_or_default()
}

pub fn build_skill_from_root(root: &PathBuf, source: &str) -> Result<AgentSkill, String> {
    let skill_md = std::fs::read_to_string(root.join("SKILL.md")).map_err(|e| e.to_string())?;
    let (name, description, instructions) = parse_skill_md(&skill_md)?;
    Ok(AgentSkill {
        id: format!("skill-{}-{}", slugify(&name), crate::models::resolve::now_stamp()),
        name,
        description,
        slug: slugify(&name),
        source_kind: source.to_string(),
        root_path: Some(root.to_string_lossy().to_string()),
        skill_md_path: Some(root.join("SKILL.md").to_string_lossy().to_string()),
        instructions,
        prompt: instructions.clone(),
        enabled: true,
        file_count: 0,
        has_scripts: root.join("scripts").is_dir(),
        has_references: root.join("references").is_dir(),
        has_assets: root.join("assets").is_dir(),
        updated_at: Some(crate::models::resolve::now_stamp()),
    })
}

fn parse_skill_md(content: &str) -> Result<(String, String, String), String> {
    let lines: Vec<&str> = content.lines().collect();
    let name = lines.first().map(|l| l.trim_start_matches("# ").trim()).unwrap_or("Untitled").to_string();
    let description = lines.get(1).map(|l| l.trim()).unwrap_or("").to_string();
    let instructions = lines.iter().skip(2).map(|l| *l).collect::<Vec<_>>().join("\n");
    Ok((name, description, instructions))
}