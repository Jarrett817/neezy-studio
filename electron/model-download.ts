import path from "node:path"

import type { CombinedModelDownloader, ModelFileAccessTokens } from "node-llama-cpp"

import { getModelUri } from "./model-uri"
import { getLlamaModule } from "./node-llama-runtime"
import type { ModelDefinition } from "./types"

export const HUB_ENDPOINTS = [
  { hubUrl: "https://hf-mirror.com", label: "hf-mirror" },
  { hubUrl: "https://huggingface.co", label: "huggingface.co" },
] as const

function resolveHfToken(): ModelFileAccessTokens | undefined {
  const token = process.env.HF_TOKEN?.trim()
  return token ? { huggingFace: token } : undefined
}

/** 多分片 URI 均在 fileOptions 中列出时，用 combineModelDownloaders 并行拉取 */
export function collectMultiPartDownloadUris(
  selectedUri: string,
  candidates: string[]
): string[] {
  const partMatch = selectedUri.match(/\.gguf\.part(\d+)of(\d+)/i)
  if (partMatch) {
    const total = parseInt(partMatch[2], 10)
    const prefix = selectedUri.replace(/\.gguf\.part\d+of\d+/i, "")
    const parts = candidates.filter((u) => {
      const m = u.match(/\.gguf\.part(\d+)of(\d+)/i)
      return m !== null && m[2] === partMatch[2] && u.startsWith(prefix)
    })
    if (parts.length >= total) {
      return parts.sort((a, b) => {
        const na = parseInt(a.match(/\.gguf\.part(\d+)of/i)?.[1] ?? "0", 10)
        const nb = parseInt(b.match(/\.gguf\.part(\d+)of/i)?.[1] ?? "0", 10)
        return na - nb
      })
    }
  }

  const splitMatch = selectedUri.match(/-(\d+)-of-(\d+)\./)
  if (splitMatch) {
    const total = parseInt(splitMatch[2], 10)
    const idx = selectedUri.indexOf(splitMatch[0])
    const prefix = selectedUri.slice(0, idx)
    const parts = candidates.filter((u) => {
      const m = u.match(/-(\d+)-of-(\d+)\./)
      return m !== null && m[2] === splitMatch[2] && u.startsWith(prefix)
    })
    if (parts.length >= total) {
      return parts.sort((a, b) => {
        const na = parseInt(a.match(/-(\d+)-of-/i)?.[1] ?? "0", 10)
        const nb = parseInt(b.match(/-(\d+)-of-/i)?.[1] ?? "0", 10)
        return na - nb
      })
    }
  }

  return [selectedUri]
}

export async function tryResolveInstalledModel(
  model: ModelDefinition,
  modelsDir: string
): Promise<string | null> {
  if (model.isLocalOnly) return model.modelUri

  const { resolveModelFile } = await getLlamaModule()
  const tokens = resolveHfToken()

  for (const endpoint of HUB_ENDPOINTS) {
    try {
      return await resolveModelFile(getModelUri(model), {
        directory: modelsDir,
        fileName: model.fileName,
        download: false,
        tokens,
        endpoints: { huggingFace: endpoint.hubUrl },
      })
    } catch {
      // try next hub
    }
  }
  return null
}

export type ModelDownloadProgress = {
  downloadedBytes: number
  totalBytes: number
  progress: number | null
}

export type ModelDownloadHandle = {
  promise: Promise<{ source: string; filePath: string }>
  cancel: () => Promise<void>
}

async function downloadWithCombinedUris(
  model: ModelDefinition,
  modelsDir: string,
  uris: string[],
  tokens: ModelFileAccessTokens | undefined,
  hubUrl: string,
  onProgress: (p: ModelDownloadProgress) => void,
  signal: AbortSignal
): Promise<{ filePath: string; downloader: CombinedModelDownloader }> {
  const { createModelDownloader, combineModelDownloaders } = await getLlamaModule()

  const downloaders = await Promise.all(
    uris.map((uri) =>
      createModelDownloader({
        modelUri: uri,
        dirPath: modelsDir,
        showCliProgress: false,
        skipExisting: true,
        tokens,
        endpoints: { huggingFace: hubUrl },
      })
    )
  )

  const combined = await combineModelDownloaders(downloaders, {
    showCliProgress: false,
    onProgress: ({ totalSize, downloadedSize }) => {
      const totalBytes = totalSize > 0 ? totalSize : model.sizeBytes
      const progress =
        totalSize > 0
          ? Math.min(100, Math.round((downloadedSize / totalSize) * 100))
          : null
      onProgress({ downloadedBytes: downloadedSize, totalBytes, progress })
    },
  })

  const paths = await combined.download({ signal })
  const normalized = paths.map((p) => path.normalize(p))
  const preferred = normalized.find((p) => path.basename(p) === model.fileName)
  return {
    filePath: preferred ?? normalized[0] ?? paths[0],
    downloader: combined,
  }
}

async function downloadWithResolveModelFile(
  model: ModelDefinition,
  modelsDir: string,
  tokens: ModelFileAccessTokens | undefined,
  hubUrl: string,
  onProgress: (p: ModelDownloadProgress) => void,
  signal: AbortSignal
): Promise<string> {
  const { resolveModelFile } = await getLlamaModule()
  return resolveModelFile(getModelUri(model), {
    directory: modelsDir,
    fileName: model.fileName,
    download: "auto",
    cli: false,
    tokens,
    endpoints: { huggingFace: hubUrl },
    signal,
    onProgress: ({ totalSize, downloadedSize }) => {
      const totalBytes = totalSize > 0 ? totalSize : model.sizeBytes
      const progress =
        totalSize > 0
          ? Math.min(100, Math.round((downloadedSize / totalSize) * 100))
          : null
      onProgress({ downloadedBytes: downloadedSize, totalBytes, progress })
    },
  })
}

/**
 * resolveModelFile（单文件）或 combineModelDownloaders（多 URI 分片并列）。
 */
export function downloadModelFile(
  model: ModelDefinition,
  modelsDir: string,
  onProgress: (progress: ModelDownloadProgress) => void,
  signal?: AbortSignal
): ModelDownloadHandle {
  const abortController = new AbortController()
  const effectiveSignal = signal ?? abortController.signal
  let cancelTarget: CombinedModelDownloader | null = null

  const promise = (async (): Promise<{ source: string; filePath: string }> => {
    if (model.isLocalOnly) {
      throw new Error("本机模型无需下载")
    }

    const tokens = resolveHfToken()
    const uris =
      model.downloadUris && model.downloadUris.length > 1
        ? model.downloadUris
        : [getModelUri(model)]

    let lastError: unknown = null
    for (const endpoint of HUB_ENDPOINTS) {
      try {
        onProgress({
          downloadedBytes: 0,
          totalBytes: model.sizeBytes,
          progress: 0,
        })

        let filePath: string
        if (uris.length > 1) {
          const combinedResult = await downloadWithCombinedUris(
            model,
            modelsDir,
            uris,
            tokens,
            endpoint.hubUrl,
            onProgress,
            effectiveSignal
          )
          cancelTarget = combinedResult.downloader
          filePath = combinedResult.filePath
        } else {
          filePath = await downloadWithResolveModelFile(
            model,
            modelsDir,
            tokens,
            endpoint.hubUrl,
            onProgress,
            effectiveSignal
          )
        }

        return { source: endpoint.label, filePath: path.normalize(filePath) }
      } catch (error) {
        if (effectiveSignal.aborted) throw error
        lastError = error
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError ?? "模型下载失败"))
  })()

  return {
    promise,
    cancel: async () => {
      abortController.abort()
      await cancelTarget?.cancel().catch(() => {})
    },
  }
}
