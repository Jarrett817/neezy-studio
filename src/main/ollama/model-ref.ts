/** Ollama 模型名解析：精确 tag 匹配，避免 qwen2.5:3b 误判 7b/14b */

export type ModelRef = { base: string; tag: string | null }

export function parseModelRef(name: string): ModelRef {
  const i = name.indexOf(":")
  if (i === -1) return { base: name, tag: null }
  return { base: name.slice(0, i), tag: name.slice(i + 1) }
}

function tagsMatch(want: ModelRef, have: ModelRef): boolean {
  if (want.tag === null) return have.base === want.base
  return have.base === want.base && have.tag === want.tag
}

/** 在 Ollama list 结果中解析出可用的模型名（用于 pull / chat） */
export function resolveInstalledRef(
  ollamaName: string,
  installedNames: ReadonlySet<string>
): string | null {
  if (installedNames.has(ollamaName)) return ollamaName

  const want = parseModelRef(ollamaName)
  if (want.tag === null) {
    for (const n of installedNames) {
      if (parseModelRef(n).base === want.base) return n
    }
    return null
  }

  for (const n of installedNames) {
    if (n === ollamaName) return n
    if (tagsMatch(want, parseModelRef(n))) return n
  }
  return null
}

export function isModelRefInstalled(
  ollamaName: string,
  installedNames: ReadonlySet<string>
): boolean {
  return resolveInstalledRef(ollamaName, installedNames) !== null
}
