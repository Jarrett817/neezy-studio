import { promptAgentOnce } from "~/services/agent-prompt"
import { searchMemories } from "~/services/memories"
import { getUserPortrait } from "~/services/user-portrait"

import { buildLlmMessages, compilePrompt } from "./compile-prompt"
import { buildMemoryQuery, normalizeSlots } from "./extract-slots"
import { parseJsonFromLlm, validateOutputSchema } from "./parse-llm-json"
import { getInputProfile, getPlaybook } from "./storage"
import { ensurePlaybookDirs } from "./seed"
import type { PlaybookRunResult, PlaybookSlots } from "./types"

function filterMemoriesByScope(
  items: Awaited<ReturnType<typeof searchMemories>>,
  categories?: string[]
): typeof items {
  if (!categories?.length) return items
  const allowed = new Set(categories.map((c) => c.toLowerCase()))
  const filtered = items.filter((m) =>
    allowed.has(m.category.toLowerCase())
  )
  return filtered.length > 0 ? filtered : items
}

function formatMemories(
  items: Awaited<ReturnType<typeof searchMemories>>
): string {
  if (items.length === 0) return ""
  return items
    .map((m, i) => `${i + 1}. [${m.category}] ${m.title}\n${m.content.slice(0, 400)}`)
    .join("\n\n")
}

type OutputLlmItem = { title?: string; body?: string; tags?: unknown }

export async function runPlaybook(
  playbookId: string,
  rawInput: Record<string, unknown>
): Promise<PlaybookRunResult> {
  const started = Date.now()
  const stages: string[] = []

  await ensurePlaybookDirs()

  const playbook = await getPlaybook(playbookId)
  if (!playbook) {
    return {
      ok: false,
      error: `未找到场景：${playbookId}`,
      trace: {
        playbookId,
        memoriesUsed: 0,
        elapsedMs: 0,
        stages,
      },
    }
  }

  const profile = await getInputProfile(playbook.inputProfileId)
  if (!profile) {
    return {
      ok: false,
      error: `未找到场景输入配置：${playbook.inputProfileId}`,
      trace: {
        playbookId,
        memoriesUsed: 0,
        elapsedMs: 0,
        stages,
      },
    }
  }

  let slots: PlaybookSlots
  try {
    slots = normalizeSlots(profile, rawInput)
  } catch (e) {
    const message = e instanceof Error ? e.message : "输入校验失败"
    return {
      ok: false,
      error: message,
      trace: {
        playbookId,
        memoriesUsed: 0,
        elapsedMs: Date.now() - started,
        stages,
      },
    }
  }

  const steps = playbook.steps ?? ["retrieve", "llm"]
  let retrievedMemories = ""
  let memoriesUsed = 0

  if (steps.includes("retrieve")) {
    stages.push("retrieve")
    const query = buildMemoryQuery(slots)
    const scope = playbook.memoryScope
    const found = await searchMemories(query, scope?.topK ?? 5)
    const scoped = filterMemoriesByScope(found, scope?.categories)
    memoriesUsed = scoped.length
    retrievedMemories = formatMemories(scoped)
  }

  const portrait = await getUserPortrait()
  const compiled = compilePrompt(profile, {
    slots,
    persona: portrait.summary,
    retrievedMemories,
  })

  stages.push("llm")
  const messages = buildLlmMessages(compiled)
  let rawText = ""
  try {
    const result = await promptAgentOnce(messages)
    rawText = result.content
  } catch (e) {
    const message = e instanceof Error ? e.message : "模型调用失败"
    return {
      ok: false,
      error: message,
      rawText,
      trace: {
        playbookId,
        memoriesUsed,
        elapsedMs: Date.now() - started,
        stages,
      },
    }
  }

  let output: Record<string, unknown> = { text: rawText }

  if (steps.includes("parse:output") || steps.includes("persist:draft")) {
    try {
      const parsed = parseJsonFromLlm(rawText)
      const validated = validateOutputSchema(
        parsed,
        playbook.outputSchema?.properties
      )
      if (validated) {
        output = validated
      } else {
        // Schema 未定义或校验失败，尝试包装为 items（兼容旧行为）
        const items = (Array.isArray(parsed) ? parsed : [parsed]) as OutputLlmItem[]
        output = { items }
      }
      stages.push("parse:output")
    } catch {
      output = { text: rawText, parseError: true }
    }
  }

  return {
    ok: true,
    output,
    rawText,
    trace: {
      playbookId,
      memoriesUsed,
      elapsedMs: Date.now() - started,
      stages,
    },
  }
}

export type DesignPlaybookTurn = {
  role: "user" | "assistant"
  content: string
}

export async function designPlaybookFromIntent(
  turns: DesignPlaybookTurn[]
): Promise<{ rawText: string; parsed?: unknown }> {
  if (turns.length === 0) {
    throw new Error("请至少发送一条场景描述")
  }
  await ensurePlaybookDirs()
  // 通用 Agent 自己决定使用哪个 skill（包括 playbook-designer），
  // 通过 pi-agent 内置的 skill 机制加载，无需手动注入。
  const messages = [
    ...turns.map((t) => ({
      role: t.role,
      content: t.content,
    })),
  ]
  const result = await promptAgentOnce(messages)
  const rawText = result.content
  try {
    return { rawText, parsed: parseJsonFromLlm(rawText) }
  } catch {
    return { rawText }
  }
}
