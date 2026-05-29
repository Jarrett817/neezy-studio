import { MEMORY_CATEGORY } from "~/config/memory-categories"
import { getElectronApi } from "~/services/electron-client"
import { saveMemory } from "~/services/memories"

export interface IngestChunk {
  index: number
  title: string
  content: string
}

export interface DocumentIngestResult {
  fileName: string
  title: string
  fullText: string
  chunks: IngestChunk[]
}

export async function pickKnowledgeDocuments(): Promise<string[]> {
  const api = getElectronApi()
  if (!api.pickDocuments) return []
  return api.pickDocuments()
}

export async function parseKnowledgeDocument(
  filePath: string
): Promise<DocumentIngestResult> {
  const api = getElectronApi()
  if (!api.ingestDocument) {
    throw new Error("当前环境不支持文档解析，请使用 Electron 客户端")
  }
  return api.ingestDocument(filePath) as Promise<DocumentIngestResult>
}

export async function importKnowledgeDocument(filePath: string): Promise<{
  fileName: string
  chunkCount: number
}> {
  const parsed = await parseKnowledgeDocument(filePath)
  for (const chunk of parsed.chunks) {
    await saveMemory({
      title: chunk.title,
      content: chunk.content,
      category: MEMORY_CATEGORY.KNOWLEDGE,
    })
  }
  return { fileName: parsed.fileName, chunkCount: parsed.chunks.length }
}

export async function importKnowledgeDocuments(
  filePaths: string[]
): Promise<{ totalChunks: number; files: string[] }> {
  let totalChunks = 0
  const files: string[] = []
  for (const filePath of filePaths) {
    const { fileName, chunkCount } = await importKnowledgeDocument(filePath)
    totalChunks += chunkCount
    files.push(fileName)
  }
  return { totalChunks, files }
}
