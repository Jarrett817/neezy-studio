use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSkill {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub source_kind: String,
    #[serde(default)]
    pub root_path: Option<String>,
    #[serde(default)]
    pub skill_md_path: Option<String>,
    #[serde(default)]
    pub instructions: String,
    pub prompt: String,
    pub enabled: bool,
    #[serde(default)]
    pub file_count: usize,
    #[serde(default)]
    pub has_scripts: bool,
    #[serde(default)]
    pub has_references: bool,
    #[serde(default)]
    pub has_assets: bool,
    #[serde(default)]
    pub updated_at: Option<String>,
}

pub fn read_skills(app: &AppHandle) -> Result<Vec<AgentSkill>, String> {
    let path = crate::models::resolve::skills_path(app)?;
    if !path.is_file() {
        return Ok(default_skills());
    }
    let raw = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

pub fn write_skills(app: &AppHandle, skills: &[AgentSkill]) -> Result<(), String> {
    crate::models::resolve::write_json(&crate::models::resolve::skills_path(app)?, skills)
}

pub fn default_skills() -> Vec<AgentSkill> {
    vec![
        AgentSkill {
            id: "content-draft".to_string(),
            name: "内容草稿".to_string(),
            description: "根据目标、素材、记忆和知识库生成草稿。".to_string(),
            prompt: "直接输出可编辑成稿，不输出思考过程。".to_string(),
            enabled: true,
            ..default_builtin_skill()
        },
        AgentSkill {
            id: "knowledge-grounding".to_string(),
            name: "知识库引用".to_string(),
            description: "优先使用知识库和用户素材，避免编造。".to_string(),
            prompt: "引用知识库信息时保持事实一致，不补不存在的数据。".to_string(),
            enabled: true,
            ..default_builtin_skill()
        },
        AgentSkill {
            id: "vision-understanding".to_string(),
            name: "图片理解".to_string(),
            description: "为视觉模型预留的图片理解能力。".to_string(),
            prompt: "当用户提供图片时，先提取画面信息，再结合文本目标生成内容。".to_string(),
            enabled: true,
            ..default_builtin_skill()
        },
    ]
}

fn default_builtin_skill() -> AgentSkill {
    AgentSkill {
        id: String::new(),
        name: String::new(),
        description: String::new(),
        slug: String::new(),
        source_kind: "builtin".to_string(),
        root_path: None,
        skill_md_path: None,
        instructions: String::new(),
        prompt: String::new(),
        enabled: true,
        file_count: 1,
        has_scripts: false,
        has_references: false,
        has_assets: false,
        updated_at: Some(crate::models::resolve::now_stamp()),
    }
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

pub fn skill_system_prompt(skills: &[AgentSkill]) -> String {
    let enabled: Vec<_> = skills.iter().filter(|s| s.enabled).collect();
    if enabled.is_empty() {
        return String::new();
    }

    let mut lines = vec!["你有一个技能系统，可以使用以下技能：".to_string()];
    for skill in &enabled {
        lines.push(format!(
            "- [{}] {}: {}",
            skill.id, skill.name, skill.description
        ));
    }
    lines.push("\n技能使用规则：".to_string());
    lines.push("- 当需要执行特定任务时，在思考中指定使用的技能ID".to_string());
    lines.push("- 格式：Action: skill_id | input: 具体输入".to_string());
    lines.push("- 如果不需要使用任何技能，直接给出最终回答".to_string());

    lines.join("\n")
}

pub fn parse_skill_action(response: &str) -> Option<(&str, &str)> {
    let response = response.trim();
    if !response.contains("Action:") {
        return None;
    }

    let action_line = response
        .lines()
        .find(|line| line.trim().starts_with("Action:"))?;

    let action = action_line
        .trim()
        .strip_prefix("Action:")
        .unwrap_or("")
        .trim();

    let parts: Vec<&str> = action.splitn(2, "| input:").collect();
    if parts.len() != 2 {
        return None;
    }

    let skill_id = parts[0].trim();
    let input = parts[1].trim();
    Some((skill_id, input))
}

pub(crate) fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }
    slug.trim_matches('-').to_string()
}

fn first_nonempty_line(value: &str) -> String {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or_default()
        .to_string()
}

pub fn build_skill_from_root(root: &PathBuf, source_kind: &str) -> Result<AgentSkill, String> {
    let skill_md_path = root.join("SKILL.md");
    let raw = std::fs::read_to_string(&skill_md_path).map_err(|error| error.to_string())?;
    let (name, description, instructions) = parse_skill_markdown(&raw)?;
    let file_count = count_files(root)?;
    Ok(normalize_skill(AgentSkill {
        id: slugify(&name),
        name: name.clone(),
        description,
        slug: slugify(&name),
        source_kind: source_kind.to_string(),
        root_path: Some(root.to_string_lossy().to_string()),
        skill_md_path: Some(skill_md_path.to_string_lossy().to_string()),
        instructions: instructions.trim().to_string(),
        prompt: String::new(),
        enabled: true,
        file_count,
        has_scripts: root.join("scripts").is_dir(),
        has_references: root.join("references").is_dir(),
        has_assets: root.join("assets").is_dir(),
        updated_at: Some(crate::models::resolve::now_stamp()),
    }))
}

fn parse_skill_markdown(raw: &str) -> Result<(String, String, String), String> {
    let mut parts = raw.splitn(3, "---");
    let prefix = parts.next().unwrap_or_default();
    if !prefix.trim().is_empty() {
        return Err("SKILL.md frontmatter 必须以 --- 开头".to_string());
    }
    let frontmatter = parts
        .next()
        .ok_or_else(|| "SKILL.md 缺少 frontmatter".to_string())?;
    let body = parts
        .next()
        .ok_or_else(|| "SKILL.md 缺少正文".to_string())?;
    let name = frontmatter_value(frontmatter, "name")
        .ok_or_else(|| "SKILL.md frontmatter 缺少 name".to_string())?;
    let description = frontmatter_value(frontmatter, "description")
        .ok_or_else(|| "SKILL.md frontmatter 缺少 description".to_string())?;
    Ok((name, description, body.to_string()))
}

fn frontmatter_value(frontmatter: &str, key: &str) -> Option<String> {
    frontmatter.lines().find_map(|line| {
        let trimmed = line.trim();
        trimmed.strip_prefix(&format!("{key}:")).map(|value| {
            value
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_string()
        })
    })
}

fn count_files(dir: &PathBuf) -> Result<usize, String> {
    let mut total = 0;
    let entries = std::fs::read_dir(dir).map_err(|error| error.to_string())?;
    for entry in entries {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir() {
            total += count_files(&path)?;
        } else {
            total += 1;
        }
    }
    Ok(total)
}
