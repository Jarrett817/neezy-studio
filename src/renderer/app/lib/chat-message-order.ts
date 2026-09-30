import type { ChatMessage } from "~/stores/app-store"

export function partitionChatMessages(messages: ChatMessage[]): {
  main: ChatMessage[]
  queued: ChatMessage[]
} {
  const main: ChatMessage[] = []
  const queued: ChatMessage[] = []
  for (const m of messages) {
    if (m.queued) queued.push(m)
    else main.push(m)
  }
  return { main, queued }
}
