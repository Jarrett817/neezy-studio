import {
  generateTextStream,
  getAccountProfile,
  getRelevantKnowledge,
  getRuntimeMetrics,
  getRuntimeSettings,
  type ContentAgentInput,
  type ContentAgentOutput,
  type ModelConfig,
} from "~/services/workspace"

const SKILLS = [
  "标题钩子",
  "账号语气",
  "知识库引用",
  "结构化表达",
  "风险词规避",
]

export async function runContentAgent(
  input: ContentAgentInput
): Promise<ContentAgentOutput> {
  const startedAt = Date.now()
  const [profile, settings, metrics, knowledge] = await Promise.all([
    getAccountProfile(),
    getRuntimeSettings(),
    getRuntimeMetrics(),
    getRelevantKnowledge(input),
  ])
  const modelSuite = resolveModelSuite(settings.models, metrics, input)
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
    : "暂无可用知识库素材。"

  const planner = await generateTextStream({
    modelId: modelSuite.planner.id,
    modelPath: modelSuite.planner.path,
    maxTokens: metrics.pressure === "high" ? 192 : 320,
    stream: false,
    messages: [
      {
        role: "system",
        content:
          "你是内容规划器。只输出简洁创作提纲，不输出思考过程，不使用“我将/我们需要”等过程描述。",
      },
      {
        role: "user",
        content: [
          `选题: ${input.topic}`,
          `目标: ${input.goal}`,
          `素材: ${input.references || "无"}`,
          `账号记忆:\n${memory}`,
          `知识库:\n${knowledgeText}`,
          `技能: ${SKILLS.join(", ")}`,
        ].join("\n\n"),
      },
    ],
  })

  const draft = await generateTextStream({
    modelId: modelSuite.writer.id,
    modelPath: modelSuite.writer.path,
    maxTokens: metrics.pressure === "high" ? 768 : 1400,
    stream: true,
    messages: [
      {
        role: "system",
        content:
          "你是内容主笔。直接输出最终草稿，不输出分析、思考过程、执行步骤或对用户无关的说明。第一行是标题，后面是正文。必须避免禁用词，优先使用真实素材，不编造数据。",
      },
      {
        role: "user",
        content: [
          `选题: ${input.topic}`,
          `目标: ${input.goal}`,
          `提纲:\n${planner}`,
          `账号记忆:\n${memory}`,
          `知识库:\n${knowledgeText}`,
          `素材:\n${input.references || "无"}`,
        ].join("\n\n"),
      },
    ],
  })

  const review = await generateTextStream({
    modelId: modelSuite.reviewer.id,
    modelPath: modelSuite.reviewer.path,
    maxTokens: 160,
    stream: false,
    messages: [
      {
        role: "system",
        content:
          "你是内容审核器。只输出 3 到 5 个适合做标签的短词，用逗号分隔。不要输出解释。",
      },
      {
        role: "user",
        content: `目标: ${input.goal}\n账号记忆:\n${memory}\n草稿:\n${draft}`,
      },
    ],
  })

  const parsed = splitDraft(draft, input.topic)

  return {
    title: parsed.title,
    body: parsed.body,
    tags: buildTags(input, review),
    trace: {
      modelId: modelSuite.writer.id,
      modelLabel: modelSuite.writer.label,
      modelPath: modelSuite.writer.path,
      selectedBy: input.modelPath ? "manual" : "auto",
      selectedReason: metrics.recommendedReason,
      modelSuite: {
        mode: modelSuite.mode,
        planner: modelSuite.planner.label,
        writer: modelSuite.writer.label,
        reviewer: modelSuite.reviewer.label,
      },
      knowledgeUsed: knowledge.length,
      totalKnowledge: knowledge.length,
      skills: SKILLS,
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
      stages: ["plan", "write", "review"],
    },
  }
}

type ModelSuite = {
  mode: "manual-single-model" | "auto-single-model" | "auto-suite"
  planner: ModelConfig
  writer: ModelConfig
  reviewer: ModelConfig
}

function resolveModelSuite(
  models: ModelConfig[],
  metrics: { recommendedModelId?: string },
  input: ContentAgentInput
): ModelSuite {
  if (input.modelPath?.trim()) {
    const manual: ModelConfig = {
      id: input.modelId || "manual",
      label: "手动指定模型",
      path: input.modelPath,
      paramsB: inferParams(input.modelPath),
      quant: "unknown",
      sizeGb: 0,
      enabled: true,
      capability: "text",
    }
    return {
      mode: "manual-single-model",
      planner: manual,
      writer: manual,
      reviewer: manual,
    }
  }

  const available = models
    .filter(
      (model) =>
        model.enabled && model.capability === "text" && model.path.trim()
    )
    .sort((a, b) => a.paramsB - b.paramsB)

  if (!available.length) {
    throw new Error("没有可用文本模型。请先在设置页下载或登记 GGUF 文本模型。")
  }

  const writer =
    available.find((model) => model.id === metrics.recommendedModelId) ||
    available[0]
  const planner = available[0]
  const reviewer =
    [...available]
      .reverse()
      .find((model) => model.paramsB <= writer.paramsB) || writer

  return {
    mode:
      planner.id === writer.id && writer.id === reviewer.id
        ? "auto-single-model"
        : "auto-suite",
    planner,
    writer,
    reviewer,
  }
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
    .split(/[\s,，。#、/]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && word.length <= 12)
  return [...new Set(words)].slice(0, 5)
}

function inferParams(path: string) {
  const match = path.match(/(\d+(?:\.\d+)?)\s*b/i)
  return match ? Number(match[1]) : 3
}
