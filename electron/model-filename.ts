import path from "node:path"

import { importNlcDistModule } from "./nlc-dist-loader"

const SPLIT_PART_PLACEHOLDER = "{number}"

type ModelDestination = {
  type: "file" | "uri" | "url"
  path?: string
  parsedUri?: {
    type: "resolved" | "unresolved"
    fullFilename?: string
    possibleFullFilenames?: string[]
  }
}

let resolveModelDestinationFn:
  | ((dest: string, convertUrlToUri?: boolean) => ModelDestination)
  | null = null

async function getResolveModelDestination() {
  if (!resolveModelDestinationFn) {
    const mod = await importNlcDistModule<{
      resolveModelDestination: (
        dest: string,
        convertUrlToUri?: boolean
      ) => ModelDestination
    }>("utils", "resolveModelDestination.js")
    resolveModelDestinationFn = mod.resolveModelDestination
  }
  return resolveModelDestinationFn
}

/** 与 node-llama-cpp resolveModelFile / CLI 落盘名一致，避免 Q4_K_M.gguf 撞名 */
export async function resolveModelFileNamesFromUri(
  uri: string
): Promise<{ fileName: string; aliases: string[] }> {
  if (!uri.startsWith("hf:") && !uri.startsWith("huggingface:")) {
    const base = path.basename(uri)
    return { fileName: base, aliases: [] }
  }

  const resolveModelDestination = await getResolveModelDestination()
  const dest = resolveModelDestination(uri, true)

  if (dest.type === "file" && dest.path) {
    const name = path.basename(dest.path)
    return { fileName: name, aliases: [] }
  }

  const parsed = dest.parsedUri
  if (!parsed) {
    return { fileName: path.basename(uri), aliases: [] }
  }

  if (parsed.type === "resolved" && parsed.fullFilename) {
    return { fileName: parsed.fullFilename, aliases: [] }
  }

  const possible = (parsed.possibleFullFilenames ?? []).filter(
    (name) => !name.includes(SPLIT_PART_PLACEHOLDER)
  )
  const fileName = possible[0] ?? path.basename(uri)
  const aliases = possible.filter((name) => name !== fileName)
  return { fileName, aliases }
}
