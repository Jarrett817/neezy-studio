import { Ollama } from "ollama"

import { getConfiguredOllamaHost } from "./env"

export function getOllamaHost(): string {
  return (
    getConfiguredOllamaHost() ??
    process.env.OLLAMA_HOST?.replace(/\/$/, "") ??
    "http://127.0.0.1:11434"
  )
}

let client: Ollama | null = null
let clientHost: string | null = null

export function resetOllamaClient(): void {
  client = null
  clientHost = null
}

export function getOllamaClient(): Ollama {
  const host = getOllamaHost()
  if (!client || clientHost !== host) {
    client = new Ollama({ host })
    clientHost = host
  }
  return client
}
