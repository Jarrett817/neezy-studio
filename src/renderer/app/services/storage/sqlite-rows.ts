import { getStoragePaths, sqliteSelect } from "~/services/electron-client"
import { ensureDbReady } from "../db"

/** 经主进程 @libsql/client 直读，避免 drizzle sqlite-proxy 在 IPC 下偶发空结果 */
export async function selectSqliteRows<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureDbReady()
  const { databaseFile } = await getStoragePaths()
  const rows = await sqliteSelect<T>(databaseFile, sql, params)
  return Array.isArray(rows) ? rows : []
}
