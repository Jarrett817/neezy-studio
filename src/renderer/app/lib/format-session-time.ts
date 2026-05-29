/** 会话时间展示（兼容 SQLite / IPC 返回 string） */
export function formatSessionTime(
  timestamp: number | string | null | undefined
): string {
  const n = typeof timestamp === "string" ? Number(timestamp) : timestamp
  if (n == null || !Number.isFinite(n) || n <= 0) return ""
  const date = new Date(n)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString()
}
