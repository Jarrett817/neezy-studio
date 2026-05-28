import type { ModelKind } from "../types"
import { getOllamaClient, getOllamaHost } from "./client"
import { ensureOllama, pingOllama } from "./lifecycle"
import { listRunningModels } from "./model-info"

export interface OllamaStatus {
  connected: boolean
  host: string
  version: string | null
  runningModels: { name: string; size: number; sizeVram?: number }[]
}

export interface OllamaModelTestResult {
  ok: boolean
  latencyMs: number
  preview?: string
  error?: string
}

export async function getOllamaStatus(): Promise<OllamaStatus> {
  const host = getOllamaHost()
  const connected = await pingOllama()
  if (!connected) {
    return { connected: false, host, version: null, runningModels: [] }
  }
  let version: string | null = null
  try {
    const ver = await getOllamaClient().version()
    version = ver.version ?? null
  } catch {
    version = null
  }
  const running = await listRunningModels()
  return {
    connected: true,
    host,
    version,
    runningModels: running.map((m) => ({
      name: m.name,
      size: m.size,
      sizeVram: m.size_vram,
    })),
  }
}

export async function testOllamaModel(
  modelName: string,
  kind: ModelKind
): Promise<OllamaModelTestResult> {
  const start = Date.now()
  await ensureOllama()
  try {
    const client = getOllamaClient()
    if (kind === "embedding") {
      const res = await client.embed({
        model: modelName,
        input: "Neezy Studio connectivity test",
      })
      const dim = res.embeddings[0]?.length ?? 0
      return {
        ok: dim > 0,
        latencyMs: Date.now() - start,
        preview: dim > 0 ? `向量维度 ${dim}` : undefined,
        error: dim > 0 ? undefined : "未返回 embedding",
      }
    }
    const res = await client.chat({
      model: modelName,
      messages: [{ role: "user", content: "只回复 OK" }],
      stream: false,
      options: { num_predict: 16, temperature: 0 },
    })
    const text = res.message.content?.trim() ?? ""
    return {
      ok: text.length > 0,
      latencyMs: Date.now() - start,
      preview: text.slice(0, 120),
      error: text.length > 0 ? undefined : "模型未返回内容",
    }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "测试失败",
    }
  }
}
