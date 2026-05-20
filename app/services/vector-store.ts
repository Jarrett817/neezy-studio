import {
  getStoragePaths,
  sqliteEnsureVectorSchema,
  sqliteVectorDeleteMemory,
  sqliteVectorSearchMemories,
  sqliteVectorSearchSlices,
  sqliteVectorUpsertMemory,
  sqliteVectorUpsertSlice,
} from "~/services/electron-client"

async function dbPath() {
  const { databaseFile } = await getStoragePaths()
  return databaseFile
}

export async function ensureVectorTables() {
  return sqliteEnsureVectorSchema(await dbPath())
}

export async function upsertMemoryEmbedding(id: string, embedding: number[]) {
  return sqliteVectorUpsertMemory(await dbPath(), id, embedding)
}

export async function deleteMemoryEmbedding(id: string) {
  return sqliteVectorDeleteMemory(await dbPath(), id)
}

export async function searchMemoriesByVector(
  embedding: number[],
  limit = 10
): Promise<
  {
    id: string
    title: string
    category: string
    content: string
    file_path: string
    created_at: number
    updated_at: number
  }[]
> {
  const { rows } = await sqliteVectorSearchMemories(await dbPath(), embedding, limit)
  return rows as {
    id: string
    title: string
    category: string
    content: string
    file_path: string
    created_at: number
    updated_at: number
  }[]
}

export async function upsertMemorySliceVector(
  id: string,
  content: string,
  sessionId: string | null,
  memoryType: string,
  embedding: number[]
) {
  return sqliteVectorUpsertSlice(
    await dbPath(),
    id,
    content,
    sessionId,
    memoryType,
    embedding
  )
}

export async function searchMemorySlicesByVector(
  embedding: number[],
  limit = 10,
  memoryType?: "conversation" | "longterm" | "rag"
) {
  const { rows } = await sqliteVectorSearchSlices(
    await dbPath(),
    embedding,
    limit,
    memoryType ?? null
  )
  return rows as {
    id: string
    session_id: string | null
    memory_type: string
    content: string
    content_preview: string
    created_at: number
  }[]
}
