// Skill MD 文件存储

import { appDataDir, exists, join, mkdir, readDir, readTextFile, remove, writeTextFile } from "~/services/electron-client"

const SKILLS_DIR = "skills"

export type Skill = {
  id: string
  name: string
  description: string
  instructions: string
  prompt: string
  enabled: boolean
  created_at: number
  updated_at: number
}

// 获取技能目录路径
async function getSkillsDir(): Promise<string> {
  const baseDir = await appDataDir()
  return await join(baseDir, SKILLS_DIR)
}

// 确保目录存在
async function ensureSkillsDir(): Promise<void> {
  const dir = await getSkillsDir()
  const dirExists = await exists(dir)
  if (!dirExists) {
    await mkdir(dir, { recursive: true })
  }
}

// 文件名安全处理
function safeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9一-龥\s\-_]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 50)
}

// 解析 MD 文件内容为 Skill 对象
function parseSkillMd(filename: string, content: string): Skill {
  const lines = content.split("\n")
  const skill: Skill = {
    id: "",
    name: filename,
    description: "",
    instructions: "",
    prompt: "",
    enabled: true,
    created_at: 0,
    updated_at: 0,
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
      case "描述":
      case "description":
        skill.description += trimmed + "\n"
        break
      case "指令":
      case "instructions":
        skill.instructions += trimmed + "\n"
        break
      case "prompt":
        skill.prompt += trimmed + "\n"
        break
    }
  }

  return skill
}

// 将 Skill 对象序列化为 MD 格式
function serializeSkillToMd(skill: Skill): string {
  const lines = [
    `# ${skill.name}`,
    "",
    "## 描述",
    skill.description,
    "",
    "## 指令",
    skill.instructions,
    "",
    "## Prompt",
    skill.prompt,
    "",
  ]
  return lines.join("\n")
}

// 获取技能文件路径
async function getSkillPath(name: string): Promise<string> {
  const dir = await getSkillsDir()
  const safeName = safeFilename(name)
  return await join(dir, `${safeName}.md`)
}

// 列出所有技能
export async function listSkills(): Promise<Skill[]> {
  try {
    const dir = await getSkillsDir()
    const dirExists = await exists(dir)
    if (!dirExists) {
      return []
    }

    const entries = await readDir(dir)
    const skills: Skill[] = []

    for (const entry of entries) {
      if (entry.name?.endsWith(".md")) {
        const filePath = await join(dir, entry.name)
        const content = await readTextFile(filePath)
        const skill = parseSkillMd(entry.name.replace(".md", ""), content)
        // 从文件元数据获取时间 (近似使用文件名为时间戳的情况)
        const nameWithoutExt = entry.name.replace(".md", "")
        skill.id = nameWithoutExt
        skills.push(skill)
      }
    }

    return skills
  } catch {
    return []
  }
}

// 保存技能
export async function saveSkill(skill: Skill): Promise<Skill> {
  try {
    await ensureSkillsDir()
    const path = await getSkillPath(skill.name)
    const content = serializeSkillToMd(skill)
    await writeTextFile(path, content)
    return skill
  } catch (error) {
    console.error(`Failed to save skill ${skill.name}:`, error)
    throw error
  }
}

// 删除技能
export async function deleteSkill(name: string): Promise<void> {
  try {
    const path = await getSkillPath(name)
    const fileExists = await exists(path)
    if (fileExists) {
      await remove(path)
    }
  } catch (error) {
    console.error(`Failed to delete skill ${name}:`, error)
  }
}
