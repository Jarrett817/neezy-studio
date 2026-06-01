import type { SessionInfo } from "./pi-sdk"

/** IPC 传输用：SessionInfo 的 Date 字段序列化为毫秒时间戳。 */
export type SessionInfoDto = Omit<SessionInfo, "created" | "modified"> & {
  created: number
  modified: number
}

export function toSessionInfoDto(info: SessionInfo): SessionInfoDto {
  return {
    ...info,
    created: info.created.getTime(),
    modified: info.modified.getTime(),
  }
}

export function sessionListTitle(info: SessionInfoDto): string {
  return info.name?.trim() || info.firstMessage?.trim().slice(0, 32) || "新对话"
}

export function sessionListPreview(info: SessionInfoDto): string {
  return (
    info.firstMessage?.trim().slice(0, 80) ||
    info.allMessagesText?.trim().slice(0, 80) ||
    ""
  )
}
