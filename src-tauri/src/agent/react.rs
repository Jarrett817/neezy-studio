use tauri::AppHandle;

use super::skill::{skill_system_prompt, AgentSkill};

const MAX_REACT_STEPS: usize = 10;

#[derive(Clone, Debug)]
pub enum Action {
    /// 直接回复，不再需要更多步骤
    Finish(String),
    /// 调用指定技能
    UseSkill { skill_id: String, input: String },
    /// 搜索知识库
    SearchKnowledge { query: String },
}

#[derive(Clone)]
pub struct ReactContext {
    pub topic: String,
    pub goal: String,
    pub references: String,
    pub skills: Vec<AgentSkill>,
    pub knowledge: Vec<super::memory::KnowledgeItem>,
}

pub async fn run_react(app: &AppHandle, context: ReactContext) -> Result<String, String> {
    let mut messages = vec![super::skill::AgentSkill {
        id: "system".to_string(),
        name: "System".to_string(),
        description: String::new(),
        prompt: skill_system_prompt(&context.skills),
        enabled: true,
        source_kind: "builtin".to_string(),
        ..Default::default()
    }];

    let user_msg = format!(
        "任务：{}\n目标：{}\n参考资料：{}",
        context.topic, context.goal, context.references
    );
    messages.push(super::skill::AgentSkill {
        id: "user".to_string(),
        name: "User".to_string(),
        description: user_msg.clone(),
        prompt: user_msg,
        enabled: true,
        source_kind: "builtin".to_string(),
        ..Default::default()
    });

    let mut steps = 0;

    while steps < MAX_REACT_STEPS {
        steps += 1;

        let input = build_think_prompt(&messages, &context);
        let response = call_model(app, input).await?;

        let action = parse_action(&response);

        match action {
            Action::Finish(result) => return Ok(result),
            Action::UseSkill { skill_id, input } => {
                let observation = execute_skill(&context.skills, &skill_id, &input);
                messages.push(super::skill::AgentSkill {
                    id: "assistant".to_string(),
                    name: "Assistant".to_string(),
                    description: format!("Thought: {}\nAction: use skill {}", response, skill_id),
                    prompt: response.clone(),
                    enabled: true,
                    source_kind: "builtin".to_string(),
                    ..Default::default()
                });
                messages.push(super::skill::AgentSkill {
                    id: "observation".to_string(),
                    name: "Observation".to_string(),
                    description: format!("Skill {} result: {}", skill_id, observation),
                    prompt: observation,
                    enabled: true,
                    source_kind: "builtin".to_string(),
                    ..Default::default()
                });
            }
            Action::SearchKnowledge { query } => {
                let results = super::memory::retrieve_relevant_knowledge(
                    app,
                    &crate::storage::settings::RuntimeSettings::default(),
                    &crate::models::resolve::RuntimeMetrics::default(),
                    &query,
                    &context.goal,
                    &context.references,
                )
                .await
                .unwrap_or_default();

                let observation = if results.is_empty() {
                    "未找到相关知识".to_string()
                } else {
                    results
                        .iter()
                        .take(3)
                        .map(|k| format!("- {}: {}", k.title, k.content))
                        .collect::<Vec<_>>()
                        .join("\n")
                };

                messages.push(super::skill::AgentSkill {
                    id: "assistant".to_string(),
                    name: "Assistant".to_string(),
                    description: format!("Thought: {}\nAction: search knowledge", response),
                    prompt: response.clone(),
                    enabled: true,
                    source_kind: "builtin".to_string(),
                    ..Default::default()
                });
                messages.push(super::skill::AgentSkill {
                    id: "observation".to_string(),
                    name: "Observation".to_string(),
                    description: observation.clone(),
                    prompt: observation,
                    enabled: true,
                    source_kind: "builtin".to_string(),
                    ..Default::default()
                });
            }
        }
    }

    Err("ReAct 循环超过最大步数限制".to_string())
}

fn build_think_prompt(messages: &[AgentSkill], _context: &ReactContext) -> String {
    let mut prompt = String::new();
    prompt.push_str("你是一个内容创作助手。使用 ReAct 框架思考：\n\n");
    prompt.push_str("思考格式：\n");
    prompt.push_str("Thought: <你的思考>\n");
    prompt.push_str("Action: <技能ID> | input: <输入内容>\n");
    prompt.push_str("或者直接回复最终结果。\n\n");
    prompt.push_str("可用技能：\n");
    prompt.push_str("- content-draft: 生成内容草稿\n");
    prompt.push_str("- knowledge-grounding: 引用知识库\n");
    prompt.push_str("- vision-understanding: 理解图片\n\n");

    for msg in messages {
        if msg.id == "user" {
            prompt.push_str(&format!("\n用户请求：{}\n", msg.description));
        }
    }

    prompt.push_str("\n请按格式回复：");
    prompt
}

async fn call_model(app: &AppHandle, prompt: String) -> Result<String, String> {
    let messages = vec![crate::LlmMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    let settings = crate::storage::settings::read_runtime_settings(app)?;
    let metrics = crate::build_runtime_metrics(&settings);
    let model = crate::models::resolve::resolve_llm_model(&settings, &metrics, None, None)?;
    let runtime = crate::runtime_plan(&metrics, &settings);

    crate::llm::generate_text_stream(
        app.clone(),
        crate::llm::RuntimeModel {
            path: model.path.clone(),
            file: model.file.clone(),
            tokenizer_repo: model.tokenizer_repo.clone(),
        },
        messages,
        runtime,
        1024,
        false,
        None,
    )
    .await
}

fn parse_action(response: &str) -> Action {
    if let Some((skill_id, input)) = super::skill::parse_skill_action(response) {
        if skill_id == "finish" || skill_id == "done" {
            return Action::Finish(input.to_string());
        }
        return Action::UseSkill {
            skill_id: skill_id.to_string(),
            input: input.to_string(),
        };
    }

    if response.contains("search") || response.contains("知识库") {
        let query = extract_query(response);
        return Action::SearchKnowledge { query };
    }

    Action::Finish(response.to_string())
}

fn extract_query(response: &str) -> String {
    response
        .lines()
        .find(|line| line.contains("query") || line.contains("查询"))
        .map(|line| {
            line.split(':')
                .nth(1)
                .unwrap_or(response)
                .trim()
                .to_string()
        })
        .unwrap_or_else(|| response.trim().to_string())
}

fn execute_skill(skills: &[AgentSkill], skill_id: &str, input: &str) -> String {
    let skill = skills.iter().find(|s| s.id == skill_id);
    match skill {
        Some(s) => format!("[{}] 执行中：{} -> {}", skill_id, s.name, input),
        None => format!("技能 {} 未找到", skill_id),
    }
}

impl Default for AgentSkill {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            description: String::new(),
            slug: String::new(),
            source_kind: String::new(),
            root_path: None,
            skill_md_path: None,
            instructions: String::new(),
            prompt: String::new(),
            enabled: true,
            file_count: 0,
            has_scripts: false,
            has_references: false,
            has_assets: false,
            updated_at: None,
        }
    }
}
