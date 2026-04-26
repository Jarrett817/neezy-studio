import { invoke } from "@tauri-apps/api/core"

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
  return invoke<ImportJob[]>("list_import_jobs")
}

export async function createImportJob(sourceUrl: string): Promise<ImportJob> {
  return invoke<ImportJob>("create_import_job", { sourceUrl })
}

export async function runNextStage(jobId: string): Promise<ImportJob> {
  return invoke<ImportJob>("run_import_job", { jobId })
}

export async function retryJob(jobId: string): Promise<ImportJob> {
  return invoke<ImportJob>("retry_import_job", { jobId })
}
