#!/usr/bin/env bun

import { readFileSync } from "node:fs"
import { Annotation, END, START, StateGraph } from "@langchain/langgraph"
import { getLlama, LlamaChatSession } from "node-llama-cpp"

type ModelRef = {
  id: string
  label: string
  path: string
  paramsB: number
  quant: string
  selectedBy: "manual" | "auto"
  reason?: string
  role?: string
}

type RuntimePlan = {
  maxThreads: number
  contextSize: number
  batchSize: number
  gpu: "auto" | false
  cpuLimitPercent: number
  pressure: "low" | "medium" | "high"
}

type ContentPayload = {
  kind?: "content"
  topic: string
  goal: string
  references: string
  model: ModelRef
  modelSuite?: {
    planner: ModelRef
    writer: ModelRef
    reviewer: ModelRef
    mode: "manual-single-model" | "auto-single-model" | "auto-suite"
  }
  runtime: RuntimePlan
  memory: {
    accountName: string
    track: string
    persona: string
    toneStyle: string
    forbiddenWords: string
  }
  knowledge: Array<{
    id?: string
    title: string
    content: string
    category: string
    similarity?: number
  }>
  skills: string[]
}

type EmbedPayload = {
  kind: "embed"
  model: ModelRef
  runtime: RuntimePlan
  texts: string[]
}

type SidecarPayload = ContentPayload | EmbedPayload
type KnowledgeItem = ContentPayload["knowledge"][number]
type AgentOutput = {
  title: string
  body: string
  tags: string[]
}

const outputSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    body: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["title", "body", "tags"],
} as const

const planSchema = {
  type: "object",
  properties: {
    angle: { type: "string" },
    outline: { type: "array", items: { type: "string" } },
    constraints: { type: "array", items: { type: "string" } },
  },
  required: ["angle", "outline", "constraints"],
} as const

function readPayload(path: string): SidecarPayload {
  const raw = readFileSync(path, "utf-8").replace(/^\uFEFF/, "")
  return JSON.parse(raw)
}

function emitEvent(event: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(event)}\n`)
}

function buildSystemPrompt(
  input: ContentPayload,
  knowledge: KnowledgeItem[],
  role: string
) {
  const knowledgeText = knowledge
    .map((item, idx) => {
      const score =
        typeof item.similarity === "number"
          ? ` similarity=${item.similarity.toFixed(3)}`
          : ""
      return `#${idx + 1} [${item.category}] ${item.title}${score}\n${item.content}`
    })
    .join("\n\n")

  return [
    "你是小红书内容生产 Agent。必须用中文输出，内容要可直接发布。",
    `账号名称：${input.memory.accountName}`,
    `账号定位：${input.memory.track}`,
    `人设：${input.memory.persona}`,
    `语气风格：${input.memory.toneStyle}`,
    `禁忌词：${input.memory.forbiddenWords || "无"}`,
    `启用技能：${input.skills.join(", ")}`,
    `当前角色：${role}`,
    `当前模型：${input.model.label}，调度方式：${input.model.selectedBy}`,
    `性能策略：${input.runtime.pressure} pressure, ${input.runtime.maxThreads} threads, ctx ${input.runtime.contextSize}`,
    `语义召回知识：\n${knowledgeText || "无"}`,
    "协作链路：MemoryAgent 负责账号长期记忆，KnowledgeAgent 只提供语义相关素材，SkillAgent 约束标题、结构、语气和禁忌词，Planner/Writer/Reviewer 分层完成。",
    "输出必须是 JSON，字段必须包含 title/body/tags。body 里直接给完整小红书草稿。",
  ].join("\n")
}

async function runEmbed(input: EmbedPayload) {
  const llama = await getLlama({
    gpu: false,
    maxThreads: Math.max(1, Math.min(input.runtime.maxThreads, 4)),
  })
  const model = await llama.loadModel({ modelPath: input.model.path })
  const context = await model.createEmbeddingContext({
    contextSize: Math.min(input.runtime.contextSize, 2048),
    batchSize: Math.min(input.runtime.batchSize, 128),
    threads: Math.max(1, Math.min(input.runtime.maxThreads, 4)),
  })

  try {
    const embeddings = []
    for (const text of input.texts) {
      const embedding = await context.getEmbeddingFor(text)
      embeddings.push(embedding.toJSON().vector)
    }
    process.stdout.write(
      JSON.stringify({
        modelId: input.model.id,
        modelLabel: input.model.label,
        dimension: embeddings[0]?.length ?? 0,
        embeddings,
      })
    )
  } finally {
    await context.dispose()
  }
}

async function runContent(input: ContentPayload) {
  const startedAt = performance.now()
  const selectedKnowledge = input.knowledge.slice(0, 8)
  emitEvent({
    type: "stage",
    stage: "semanticMemoryAgent",
    message: `语义召回 ${selectedKnowledge.length}/${input.knowledge.length} 条知识`,
  })
  emitEvent({
    type: "stage",
    stage: "llamaRuntime",
    message: "正在初始化 node-llama-cpp",
  })
  const llama = await getLlama({
    gpu: input.runtime.gpu,
    maxThreads: input.runtime.maxThreads,
  })
  emitEvent({
    type: "stage",
    stage: "grammar",
    message: "正在准备结构化输出 grammar",
  })
  const outputGrammar = await llama.createGrammarForJsonSchema(outputSchema)
  const planGrammar = await llama.createGrammarForJsonSchema(planSchema)
  const suite = input.modelSuite ?? {
    planner: input.model,
    writer: input.model,
    reviewer: input.model,
    mode: "auto-single-model" as const,
  }
  const sessions = new Map<string, { label: string; session: LlamaChatSession }>()

  async function getSession(modelConfig: ModelRef, role: string) {
    const cacheKey = `${role}:${modelConfig.path}`
    const existing = sessions.get(cacheKey)
    if (existing) return existing

    emitEvent({
      type: "stage",
      stage: role,
      message: `正在加载模型 ${modelConfig.label}`,
    })
    const model = await llama.loadModel({ modelPath: modelConfig.path })
    const context = await model.createContext({
      contextSize: input.runtime.contextSize,
      batchSize: input.runtime.batchSize,
      threads: input.runtime.maxThreads,
    })
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: buildSystemPrompt(
        { ...input, model: modelConfig },
        selectedKnowledge,
        role
      ),
    })
    const loaded = { label: modelConfig.label, session }
    sessions.set(cacheKey, loaded)
    return loaded
  }

  const AgentState = Annotation.Root({
    input: Annotation<ContentPayload>(),
    memory: Annotation<Record<string, string>>(),
    knowledge: Annotation<KnowledgeItem[]>(),
    plan: Annotation<any>(),
    draft: Annotation<AgentOutput>(),
    final: Annotation<AgentOutput>(),
  })

  const graph = new StateGraph(AgentState)
    .addNode("loadMemory", async (state) => ({
      memory: {
        accountName: state.input.memory.accountName,
        track: state.input.memory.track,
        persona: state.input.memory.persona,
        toneStyle: state.input.memory.toneStyle,
        forbiddenWords: state.input.memory.forbiddenWords,
      },
    }))
    .addNode("retrieveKnowledge", async () => {
      emitEvent({
        type: "stage",
        stage: "knowledgeAgent",
        message: "知识库语义检索完成",
      })
      return { knowledge: selectedKnowledge }
    })
    .addNode("planContent", async (state) => {
      emitEvent({
        type: "stage",
        stage: "plannerAgent",
        message: "正在规划选题角度和大纲",
      })
      const planner = await getSession(suite.planner, "PlannerAgent")
      const planResponse = await planner.session.prompt(
        [
          `选题：${state.input.topic}`,
          `目标：${state.input.goal}`,
          `引用：${state.input.references || "无"}`,
          `记忆：${JSON.stringify(state.memory)}`,
          `知识：${JSON.stringify(state.knowledge)}`,
          "请输出创作角度、结构大纲和限制条件 JSON。",
        ].join("\n"),
        {
          grammar: planGrammar,
          temperature: 0.2,
          topP: 0.85,
          onTextChunk: (text) =>
            emitEvent({ type: "token", stage: "plannerAgent", text }),
        }
      )
      return { plan: planGrammar.parse(planResponse.trim()) }
    })
    .addNode("writeDraft", async (state) => {
      emitEvent({
        type: "stage",
        stage: "writerAgent",
        message: "正在生成草稿",
      })
      const writer = await getSession(suite.writer, "ContentAgent")
      const response = await writer.session.prompt(
        [
          `选题：${state.input.topic}`,
          `创作目标：${state.input.goal}`,
          `引用素材：${state.input.references || "无"}`,
          `长期记忆：${JSON.stringify(state.memory)}`,
          `语义知识库：${JSON.stringify(state.knowledge)}`,
          `规划：${JSON.stringify(state.plan)}`,
          "只输出符合 schema 的 JSON，不要 markdown，不要解释。",
        ].join("\n"),
        {
          grammar: outputGrammar,
          temperature: 0.4,
          topP: 0.9,
          onTextChunk: (text) =>
            emitEvent({ type: "token", stage: "writerAgent", text }),
        }
      )
      return { draft: outputGrammar.parse(response.trim()) as AgentOutput }
    })
    .addNode("reviewDraft", async (state) => {
      emitEvent({
        type: "stage",
        stage: "reviewAgent",
        message: "正在复核并润色",
      })
      const reviewer = await getSession(suite.reviewer, "ReviewAgent")
      const reviewResponse = await reviewer.session.prompt(
        [
          "请检查并润色下面的小红书草稿，保持 JSON 字段 title/body/tags。",
          `账号禁忌词：${state.memory.forbiddenWords || "无"}`,
          `规划：${JSON.stringify(state.plan)}`,
          `草稿：${JSON.stringify(state.draft)}`,
        ].join("\n"),
        {
          grammar: outputGrammar,
          temperature: 0.25,
          topP: 0.85,
          onTextChunk: (text) =>
            emitEvent({ type: "token", stage: "reviewAgent", text }),
        }
      )
      return { final: outputGrammar.parse(reviewResponse.trim()) as AgentOutput }
    })
    .addEdge(START, "loadMemory")
    .addEdge("loadMemory", "retrieveKnowledge")
    .addEdge("retrieveKnowledge", "planContent")
    .addEdge("planContent", "writeDraft")
    .addEdge("writeDraft", "reviewDraft")
    .addEdge("reviewDraft", END)
    .compile()

  const result = await graph.invoke({ input })
  const parsed = result.final

  emitEvent({
    type: "final",
    output: {
      title: parsed.title,
      body: parsed.body,
      tags: parsed.tags,
      trace: {
        modelId: input.model.id,
        modelLabel: suite.writer.label,
        modelPath: suite.writer.path,
        selectedBy: input.model.selectedBy,
        selectedReason: input.model.reason,
        modelSuite: {
          mode: suite.mode,
          planner: suite.planner.label,
          writer: suite.writer.label,
          reviewer: suite.reviewer.label,
        },
        knowledgeUsed: selectedKnowledge.length,
        totalKnowledge: input.knowledge.length,
        skills: input.skills,
        runtime: input.runtime,
        elapsedMs: Math.round(performance.now() - startedAt),
        stages: [
          "memoryAgent",
          "semanticMemoryAgent",
          "knowledgeAgent",
          "plannerAgent",
          "writerAgent",
          "reviewAgent",
          "skillsAgent",
          "contentAgent",
        ],
      },
    },
  })
}

async function main() {
  const payloadPath = process.argv[2]
  if (!payloadPath) throw new Error("missing payload path")
  const payload = readPayload(payloadPath)
  if (payload.kind === "embed") {
    await runEmbed(payload)
  } else {
    await runContent(payload)
  }
}

main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
