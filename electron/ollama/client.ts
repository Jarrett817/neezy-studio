import { Ollama } from "ollama"

export function getOllamaHost(): string {
  return process.env.OLLAMA_HOST?.replace(/\/$/, "") ?? "http://127.0.0.1:11434"
}

let client: Ollama | null = null

export function getOllamaClient(): Ollama {
  if (!client) {
    client = new Ollama({ host: getOllamaHost() })
  }
  return client
}
