import {
  addMemoryEvent,
  ensureOllamaRunning,
  getAccountProfile,
  getRelevantKnowledge,
  getRuntimeMetrics,
  getRuntimeSettings,
  listSkills,
  chat,
  type AgentExecutionStep,
  type AgentSkill,
  type ContentAgentInput,
  type ContentAgentOutput,
} from "~/services/workspace"

const FALLBACK_SKILLS = [
  "标题钩子",
  "账号语气",
  "知识约束",
  "结构表达",
  "风险规避",
]

type RunContentAgentOptions = {
  onStepsChange?: (steps: AgentExecutionStep[]) => void
  onToken?: (token: string) => void
}

export async function runContentAgent(
  input: ContentAgentInput,
  options: RunContentAgentOptions = {}
): Promise<ContentAgentOutput> {
  const startedAt = Date.now()
  const updateSteps = createStepReporter(options.onStepsChange)

  // 确保 Ollama 运行中
  await ensureOllamaRunning()

  updateSteps([
    step("setup", "准备上下文", "读取账号、模型、知识库和技能包", "running"),
    step("knowledge", "召回知识", "等待知识库召回", "pending"),
    step("plan", "生成提纲", "等待提纲", "pending"),
    step("write", "生成正文", "等待正文", "pending"),
    step("review", "整理结果", "等待标签和收尾", "pending"),
  ])

  const [profile, settings, metrics, skills] = await Promise.all([
    getAccountProfile(),
    getRuntimeSettings(),
    getRuntimeMetrics(),
    listSkills(),
  ])

  // 获取 Ollama 模型名称
  const modelName = settings.ollamaModel || "qwen3"
  const enabledSkills = skills.filter((skill) => skill.enabled)
  const useFastPath =
    settings.preferLowPower ||
    metrics.pressure !== "low" ||
    metrics.availableMemoryGb < 8
  const knowledge = useFastPath ? [] : await getRelevantKnowledge(input)
  const memory = [
    `账号: ${profile.accountName || "未配置"}`,
    `赛道: ${profile.track || "未配置"}`,
    `人设: ${profile.persona || "未配置"}`,
    `语气: ${profile.toneStyle || "未配置"}`,
    `禁用词: ${profile.forbiddenWords || "无"}`,
  ].join("\n")
  const knowledgeText = knowledge.length
    ? knowledge
        .map(
          (item, index) =>
            `${index + 1}. [${item.category}] ${item.title}\n${item.content}`
        )
        .join("\n\n")
    : "暂无可用知识。"
  updateSteps((steps) =>
    steps.map((item) => {
      if (item.key === "setup") {
        return {
          ...item,
          status: "done",
          detail: `使用模型 ${modelName}，启用技能 ${enabledSkills.length} 个`,
          elapsedMs: Date.now() - startedAt,
        }
      }
      if (item.key === "knowledge") {
        return {
          ...item,
          status: "done",
          detail: useFastPath
            ? "快路径已跳过知识召回，优先尽快出首响"
            : knowledge.length
            ? `召回 ${knowledge.length} 条知识`
            : "本轮未召回知识，回退到用户输入",
          elapsedMs: Date.now() - startedAt,
        }
      }
      if (item.key === "plan") {
        return {
          ...item,
          status: useFastPath ? "skipped" : "running",
          detail: useFastPath
            ? "当前负载较高，跳过单独提纲阶段"
            : `使用 ${modelName} 生成提纲`,
        }
      }
      return item
    })
  )

  const plannerResult =
    useFastPath
      ? { content: "", thinking: undefined }
      : await chat({
          model: modelName,
          maxTokens: 256,
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content:
                "你是内容规划器。只输出简洁可执行的提纲，不输出思考过程。",
            },
            {
              role: "user",
              content: [
                `选题: ${input.topic}`,
                `目标: ${input.goal}`,
                `素材: ${input.references || "无"}`,
                `账号记忆:\n${memory}`,
                `知识库:\n${knowledgeText}`,
                `技能:\n${formatSkills(enabledSkills)}`,
              ].join("\n\n"),
            },
          ],
        })
  const planner = plannerResult.content

  if (!useFastPath) {
    updateSteps((steps) =>
      steps.map((item) =>
        item.key === "plan"
          ? {
              ...item,
              status: "done",
              detail: "提纲已生成，开始写正文",
              elapsedMs: Date.now() - startedAt,
            }
          : item.key === "write"
            ? {
                ...item,
                status: "running",
                detail: `使用 ${modelName} 生成正文`,
              }
            : item
      )
    )
  } else {
    updateSteps((steps) =>
      steps.map((item) =>
        item.key === "write"
          ? {
              ...item,
              status: "running",
              detail: `快路径直写，使用 ${modelName}`,
            }
          : item
      )
    )
  }

  let draftResult = await chat({
    model: modelName,
    maxTokens: metrics.pressure === "high" ? 640 : 1200,
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content:
          "你是内容主笔。直接输出最终成稿。第一行是标题，后面是正文，不输出思考过程。",
      },
      {
        role: "user",
        content: [
          `选题: ${input.topic}`,
          `目标: ${input.goal}`,
          planner ? `提纲:\n${planner}` : "",
          `账号记忆:\n${memory}`,
          `知识库:\n${knowledgeText}`,
          `技能:\n${formatSkills(enabledSkills)}`,
          `素材:\n${input.references || "无"}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  })
  const draft = draftResult.content

  updateSteps((steps) =>
    steps.map((item) => {
      if (item.key === "write") {
        return {
          ...item,
          status: "done",
          detail: `正文已生成，长度 ${draft.length} 字符`,
          elapsedMs: Date.now() - startedAt,
        }
      }
      if (item.key === "review") {
        return {
          ...item,
          status: useFastPath ? "running" : "running",
          detail: useFastPath
            ? "快路径本地整理标签和结果"
            : `使用 ${modelName} 生成标签`,
        }
      }
      return item
    })
  )

  const reviewResult = useFastPath
    ? { content: "", thinking: undefined }
    : await chat({
        model: modelName,
        maxTokens: 160,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "你是内容审核器。只输出 3 到 5 个适合作为标签的短词，用逗号分隔。",
          },
          {
            role: "user",
            content: `目标: ${input.goal}\n账号记忆:\n${memory}\n草稿:\n${draft}`,
          },
        ],
      })
  const review = reviewResult.content

  const parsed = splitDraft(draft, input.topic)
  await addMemoryEvent({
    layer: "conversation",
    source: "content-agent",
    content: `topic: ${input.topic}\ngoal: ${input.goal}\ntitle: ${parsed.title}`,
  })

  updateSteps((steps) =>
    steps.map((item) =>
      item.key === "review"
        ? {
            ...item,
            status: "done",
            detail: useFastPath ? "已本地整理结果" : "标签已生成",
            elapsedMs: Date.now() - startedAt,
          }
        : item
    )
  )

  return {
    title: parsed.title,
    body: parsed.body,
    tags: buildTags(input, review || parsed.title),
    trace: {
      modelId: modelName,
      modelLabel: modelName,
      selectedBy: "auto",
      selectedReason: `使用 Ollama 模型 ${modelName}`,
      knowledgeUsed: knowledge.length,
      totalKnowledge: knowledge.length,
      skills: enabledSkills.map((skill) => skill.name),
      runtime: {
        maxThreads: Math.max(
          1,
          metrics.pressure === "high"
            ? Math.floor(metrics.cpuCount / 2)
            : metrics.cpuCount - 1
        ),
        contextSize:
          metrics.pressure === "high" || metrics.availableMemoryGb < 6
            ? 2048
            : 4096,
        batchSize:
          metrics.pressure === "high" || metrics.availableMemoryGb < 6
            ? 128
            : 256,
        gpu: metrics.pressure === "high" ? false : "auto",
        cpuLimitPercent: settings.maxCpuPercent,
        pressure: metrics.pressure,
      },
      elapsedMs: Date.now() - startedAt,
      stages: useFastPath ? ["setup", "knowledge", "write", "review"] : ["setup", "knowledge", "plan", "write", "review"],
    },
  }
}

function createStepReporter(
  onStepsChange?: (steps: AgentExecutionStep[]) => void
) {
  let current: AgentExecutionStep[] = []
  return (next: AgentExecutionStep[] | ((steps: AgentExecutionStep[]) => AgentExecutionStep[])) => {
    current = typeof next === "function" ? next(current) : next
    onStepsChange?.(current)
  }
}

function step(
  key: string,
  label: string,
  detail: string,
  status: AgentExecutionStep["status"]
): AgentExecutionStep {
  return { key, label, detail, status }
}

function formatSkills(skills: AgentSkill[], compact = true) {
  if (!skills.length) return FALLBACK_SKILLS.join("\n")
  if (compact) {
    return skills
      .map((skill) => {
        const hint = skill.prompt?.trim().split("\n")[0] ?? skill.instructions?.trim().split("\n")[0] ?? ""
        return `${skill.name}: ${hint}`.trim()
      })
      .join("\n")
  }
  return skills
    .map(
      (skill) =>
        `- ${skill.name}: ${skill.description}\n${skill.instructions || skill.prompt}`
    )
    .join("\n\n")
}

function splitDraft(text: string, fallbackTitle: string) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const first = lines[0]?.replace(/^标题[:：]\s*/, "")
  return {
    title: first || fallbackTitle,
    body: lines.length > 1 ? lines.slice(1).join("\n\n") : text.trim(),
  }
}

function buildTags(input: ContentAgentInput, review: string) {
  const words = `${input.topic} ${review}`
    .split(/[\s,，、。]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && word.length <= 12)
  return [...new Set(words)].slice(0, 5)
}
