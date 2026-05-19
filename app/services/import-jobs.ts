export type JobStage =
  | "queued"
  | "screenshot"
  | "extract"
  | "understand"
  | "done"
  | "failed"

export type ImportJob = {
  id: string
  sourceUrl: string
  stage: JobStage
  createdAt: string
  updatedAt: string
  noteId: string
  insight?: string
  extracted?: {
    author: string
    title: string
    likes: number
    saves: number
  }
  errorMessage?: string
}

export async function listImportJobs(): Promise<ImportJob[]> {
  return []
}

export async function createImportJob(sourceUrl: string): Promise<ImportJob> {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    sourceUrl,
    stage: "queued",
    createdAt: now,
    updatedAt: now,
    noteId: "",
  }
}

export async function runNextStage(_jobId: string): Promise<ImportJob> {
  throw new Error("Import jobs are not implemented in the Electron runtime yet.")
}

export async function retryJob(jobId: string): Promise<ImportJob> {
  return runNextStage(jobId)
}
