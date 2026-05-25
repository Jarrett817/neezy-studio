import { createRequire } from "node:module"
import path from "node:path"
import { pathToFileURL } from "node:url"

const nodeRequire = createRequire(__filename)

export function getNodeLlamaCppDistDir(): string {
  return path.dirname(nodeRequire.resolve("node-llama-cpp"))
}

export function importNlcDistModule<T>(...segments: string[]): Promise<T> {
  const filePath = path.join(getNodeLlamaCppDistDir(), ...segments)
  const href = pathToFileURL(filePath).href
  return new Function("u", "return import(u)")(href) as Promise<T>
}
