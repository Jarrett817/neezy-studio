// AI 人设 MD 文件存储

import {
  exists,
  join,
  mkdir,
  readTextFile,
  writeTextFile,
} from "~/services/electron-client"
import { getStoragePaths } from "~/services/storage-paths"

const PERSONA_FILE = "current.md"

export type Persona = {
  accountName: string
  track: string
  persona: string
  toneStyle: string
  forbiddenWords: string
}

async function getPersonaPath(): Promise<string> {
  const { personasDir } = await getStoragePaths()
  return await join(personasDir, PERSONA_FILE)
}

async function ensurePersonasDir(): Promise<void> {
  const { personasDir: dir } = await getStoragePaths()
  const dirExists = await exists(dir)
  if (!dirExists) {
    await mkdir(dir, { recursive: true })
  }
}

// 解析 MD 文件内容为人设对象
function parsePersonaMd(content: string): Persona {
  const lines = content.split("\n")
  const persona: Persona = {
    accountName: "",
    track: "",
    persona: "",
    toneStyle: "",
    forbiddenWords: "",
  }

  let currentSection = ""

  for (const line of lines) {
    const trimmed = line.trim()

    // 检测 ## 标题
    if (trimmed.startsWith("## ")) {
      currentSection = trimmed.slice(3).toLowerCase()
      continue
    }

    // 跳过空行和元信息
    if (!trimmed || currentSection === "") continue

    // 累积内容到对应字段
    switch (currentSection) {
      case "accountname":
      case "account_name":
        persona.accountName += trimmed
        break
      case "track":
        persona.track += trimmed
        break
      case "persona":
        persona.persona += trimmed
        break
      case "tonestyle":
      case "tone_style":
        persona.toneStyle += trimmed
        break
      case "forbiddenwords":
      case "forbidden_words":
        persona.forbiddenWords += trimmed
        break
    }
  }

  return persona
}

// 将人设对象序列化为 MD 格式
function serializePersonaToMd(persona: Persona): string {
  const lines = [
    "# AI Persona",
    "",
    "## AccountName",
    persona.accountName,
    "",
    "## Track",
    persona.track,
    "",
    "## Persona",
    persona.persona,
    "",
    "## ToneStyle",
    persona.toneStyle,
    "",
    "## ForbiddenWords",
    persona.forbiddenWords,
    "",
  ]
  return lines.join("\n")
}

// 读取人设
export async function getPersona(): Promise<Persona> {
  try {
    const path = await getPersonaPath()
    const fileExists = await exists(path)
    if (!fileExists) {
      return {
        accountName: "",
        track: "",
        persona: "",
        toneStyle: "",
        forbiddenWords: "",
      }
    }
    const content = await readTextFile(path)
    return parsePersonaMd(content)
  } catch {
    return {
      accountName: "",
      track: "",
      persona: "",
      toneStyle: "",
      forbiddenWords: "",
    }
  }
}

// 保存人设
export async function savePersona(persona: Persona): Promise<Persona> {
  await ensurePersonasDir()
  const path = await getPersonaPath()
  const content = serializePersonaToMd(persona)
  await writeTextFile(path, content)
  return persona
}
