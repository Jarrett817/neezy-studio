# 存储分层实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 根据存储分层规范，实现 MD / SQLite / 向量库 三层存储架构

**Architecture:**
- MD 文件层: AI 人设、Prompt 模板、技能定义、系统提示词、个人偏好
- SQLite 层: 会话列表、设置配置、知识库元数据、标签分类
- 向量库层: 聊天切片、长期记忆、RAG 知识库切片

**Tech Stack:** React + Tauri + Drizzle ORM + sqlite-vec + tauri-plugin-fs

---

## 文件结构

```
app/services/
  ├── fs-memory.ts          # MD 文件操作 (已存在，需扩展)
  ├── memories.ts          # 记忆服务 (已存在，需重构)
  ├── db/
  │   ├── index.ts          # DB 初始化 (已存在)
  │   ├── schema.ts         # Drizzle schema (已存在，需扩展)
  │   └── migrate.ts        # 迁移 (已存在)
  ├── storage/
  │   ├── persona.ts        # AI 人设 MD 存储
  │   ├── skills.ts         # 技能定义 MD 存储
  │   ├── sessions.ts       # 会话列表 SQLite
  │   ├── settings.ts       # 设置 SQLite 迁移
  │   └── memory-vectors.ts # 记忆向量存储
```

---

## Task 1: 扩展 MD 文件存储 - AI 人设 (Persona)

**Files:**
- Create: `app/services/storage/persona.ts`
- Modify: `app/routes/settings.tsx` (改用新存储)
- Modify: `app/services/workspace.ts` (AccountProfile 改用 MD)

- [ ] **Step 1: 创建 persona.ts MD 存储服务**

```typescript
// app/services/storage/persona.ts
import { appDataDir, join } from "@tauri-apps/api/path"
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs"

const PERSONA_DIR = "personas"

export type Persona = {
  accountName: string
  track: string
  persona: string
  toneStyle: string
  forbiddenWords: string
}

async function getPersonaDir(): Promise<string> {
  const baseDir = await appDataDir()
  return join(baseDir, PERSONA_DIR)
}

async function ensurePersonaDir(): Promise<string> {
  const dir = await getPersonaDir()
  const dirExists = await exists(dir)
  if (!dirExists) {
    await mkdir(dir, { recursive: true })
  }
  return dir
}

// 获取当前人设 MD 文件路径
async function getPersonaPath(): Promise<string> {
  const dir = await ensurePersonaDir()
  return join(dir, "current.md")
}

// 读取人设 (从 MD 文件)
export async function getPersona(): Promise<Persona> {
  const path = await getPersonaPath()
  const fileExists = await exists(path)
  if (!fileExists) {
    return { accountName: "", track: "", persona: "", toneStyle: "", forbiddenWords: "" }
  }
  const content = await readTextFile(path)
  return parsePersonaMd(content)
}

// 保存人设 (写入 MD 文件)
export async function savePersona(persona: Persona): Promise<Persona> {
  const path = await getPersonaPath()
  const content = formatPersonaMd(persona)
  await writeTextFile(path, content)
  return persona
}

// 解析 MD 内容为人设对象
function parsePersonaMd(content: string): Persona {
  const lines = content.split("\n")
  const result: Persona = {
    accountName: "",
    track: "",
    persona: "",
    toneStyle: "",
    forbiddenWords: "",
  }
  let currentKey = ""
  let currentValue = ""

  for (const line of lines) {
    const keyMatch = line.match(/^(账号名称|赛道|人设描述|语气风格|禁用词)[:：]\s*/)
    if (keyMatch) {
      if (currentKey) {
        assignField(result, currentKey, currentValue.trim())
      }
      currentKey = keyMatch[1]
      currentValue = line.slice(keyMatch[0].length)
    } else if (currentKey && line.startsWith("  ")) {
      currentValue += "\n" + line.trim()
    }
  }
  if (currentKey) {
    assignField(result, currentKey, currentValue.trim())
  }
  return result
}

function assignField(obj: Persona, key: string, value: string) {
  switch (key) {
    case "账号名称": obj.accountName = value; break
    case "赛道": obj.track = value; break
    case "人设描述": obj.persona = value; break
    case "语气风格": obj.toneStyle = value; break
    case "禁用词": obj.forbiddenWords = value; break
  }
}

function formatPersonaMd(persona: Persona): string {
  return `# ${persona.accountName || "未命名账号"} 人设

## 基本信息

账号名称: ${persona.accountName}
赛道: ${persona.track}

## 人设描述

${persona.persona || "未设置"}

## 语气风格

${persona.toneStyle || "未设置"}

## 禁用词

${persona.forbiddenWords || "无"}
`
}
```

- [ ] **Step 2: 更新 workspace.ts 使用 persona.ts**

```typescript
// app/services/workspace.ts 添加
import { getPersona, savePersona, type Persona } from "./storage/persona"

// 替换 getAccountProfile
export async function getAccountProfile(): Promise<AccountProfile> {
  const persona = await getPersona()
  return {
    accountName: persona.accountName,
    track: persona.track,
    persona: persona.persona,
    toneStyle: persona.toneStyle,
    forbiddenWords: persona.forbiddenWords,
  }
}

// 替换 saveAccountProfile  
export async function saveAccountProfile(profile: AccountProfile): Promise<AccountProfile> {
  await savePersona({
    accountName: profile.accountName,
    track: profile.track,
    persona: profile.persona,
    toneStyle: profile.toneStyle,
    forbiddenWords: profile.forbiddenWords,
  })
  return profile
}
```

- [ ] **Step 3: 更新 settings.tsx 移除 stub 实现**

settings.tsx 中的 AccountSection 使用 getAccountProfile/saveAccountProfile，不需要修改，因为接口保持一致。

---

## Task 2: 创建 SQLite Schema 扩展 - 会话列表

**Files:**
- Modify: `app/services/db/schema.ts`
- Create: `drizzle/0001_sessions.sql`

- [ ] **Step 1: 创建会话表迁移**

```sql
-- drizzle/0001_sessions.sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  message_count INTEGER DEFAULT 0,
  last_message_preview TEXT
);
```

- [ ] **Step 2: 扩展 schema.ts**

```typescript
// app/services/db/schema.ts 添加
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
  message_count: integer("message_count").default(0),
  last_message_preview: text("last_message_preview"),
})
```

---

## Task 3: 创建会话存储服务

**Files:**
- Create: `app/services/storage/sessions.ts`

- [ ] **Step 1: 创建 sessions.ts**

```typescript
// app/services/storage/sessions.ts
import { nanoid } from "nanoid"
import { eq, desc } from "drizzle-orm"
import { getDb, schema } from "~/services/db"

export type Session = {
  id: string
  title: string
  created_at: number
  updated_at: number
  message_count: number
  last_message_preview: string | null
}

export async function createSession(title: string): Promise<Session> {
  const db = getDb()
  const now = Date.now()
  const id = nanoid(21)
  
  await db.insert(schema.sessions).values({
    id,
    title,
    created_at: now,
    updated_at: now,
    message_count: 0,
    last_message_preview: null,
  })
  
  return { id, title, created_at: now, updated_at: now, message_count: 0, last_message_preview: null }
}

export async function listSessions(): Promise<Session[]> {
  const db = getDb()
  return db.select().from(schema.sessions).orderBy(desc(schema.sessions.updated_at))
}

export async function updateSession(id: string, updates: Partial<Pick<Session, "title" | "message_count" | "last_message_preview">>): Promise<void> {
  const db = getDb()
  await db.update(schema.sessions)
    .set({ ...updates, updated_at: Date.now() })
    .where(eq(schema.sessions.id, id))
}

export async function deleteSession(id: string): Promise<void> {
  const db = getDb()
  await db.delete(schema.sessions).where(eq(schema.sessions.id, id))
}
```

---

## Task 4: 创建技能 MD 存储

**Files:**
- Create: `app/services/storage/skills.ts`

- [ ] **Step 1: 创建 skills.ts**

```typescript
// app/services/storage/skills.ts
import { appDataDir, join } from "@tauri-apps/api/path"
import { readTextFile, writeTextFile, mkdir, exists, remove, readDir } from "@tauri-apps/plugin-fs"
import { nanoid } from "nanoid"

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

async function getSkillsDir(): Promise<string> {
  const baseDir = await appDataDir()
  return join(baseDir, SKILLS_DIR)
}

async function ensureSkillsDir(): Promise<string> {
  const dir = await getSkillsDir()
  const dirExists = await exists(dir)
  if (!dirExists) {
    await mkdir(dir, { recursive: true })
  }
  return dir
}

function getSkillPath(dir: string, name: string): string {
  const safeName = name.replace(/[^a-zA-Z0-9一-龥\s\-_]/g, "").trim()
  return join(dir, `${safeName}.md`)
}

export async function listSkills(): Promise<Skill[]> {
  const dir = await ensureSkillsDir()
  const entries = await readDir(dir)
  const skills: Skill[] = []

  for (const entry of entries) {
    if (entry.name?.endsWith(".md")) {
      const path = join(dir, entry.name)
      const content = await readTextFile(path)
      skills.push(parseSkillMd(content, entry.name))
    }
  }
  return skills
}

export async function saveSkill(skill: Skill): Promise<Skill> {
  const dir = await ensureSkillsDir()
  const path = getSkillPath(dir, skill.name)
  const content = formatSkillMd(skill)
  await writeTextFile(path, content)
  return skill
}

export async function deleteSkill(id: string, name: string): Promise<void> {
  const dir = await ensureSkillsDir()
  const path = getSkillPath(dir, name)
  const fileExists = await exists(path)
  if (fileExists) {
    await remove(path)
  }
}

function parseSkillMd(content: string, filename: string): Skill {
  const lines = content.split("\n")
  const skill: Skill = {
    id: nanoid(21),
    name: "",
    description: "",
    instructions: "",
    prompt: "",
    enabled: true,
    created_at: Date.now(),
    updated_at: Date.now(),
  }
  
  let currentSection = ""
  let currentContent = ""
  
  for (const line of lines) {
    if (line.startsWith("# ")) {
      skill.name = line.slice(2).trim()
    } else if (line.startsWith("## ")) {
      if (currentSection === "instructions") {
        skill.instructions = currentContent.trim()
      } else if (currentSection === "prompt") {
        skill.prompt = currentContent.trim()
      }
      currentSection = line.slice(3).trim().toLowerCase()
      currentContent = ""
    } else {
      currentContent += "\n" + line
    }
  }
  if (currentSection === "instructions") {
    skill.instructions = currentContent.trim()
  } else if (currentSection === "prompt") {
    skill.prompt = currentContent.trim()
  }
  
  return skill
}

function formatSkillMd(skill: Skill): string {
  return `# ${skill.name}

## 描述

${skill.description}

## 指令

${skill.instructions}

## Prompt

${skill.prompt}
`
}
```

---

## Task 5: 迁移设置到 SQLite

**Files:**
- Create: `drizzle/0002_settings.sql`
- Modify: `app/services/db/schema.ts`
- Create: `app/services/storage/settings-store.ts`
- Modify: `app/services/settings.ts`

- [ ] **Step 1: 创建设置表迁移**

```sql
-- drizzle/0002_settings.sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

- [ ] **Step 2: 扩展 schema.ts**

```typescript
// app/services/db/schema.ts 添加
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updated_at: integer("updated_at").notNull(),
})
```

- [ ] **Step 3: 创建 settings-store.ts**

```typescript
// app/services/storage/settings-store.ts
import { getDb, schema } from "~/services/db"
import { eq } from "drizzle-orm"

export async function getSetting<T = string>(key: string): Promise<T | null> {
  const db = getDb()
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()
  if (!row) return null
  return JSON.parse(row.value) as T
}

export async function setSetting<T = string>(key: string, value: T): Promise<void> {
  const db = getDb()
  await db.insert(schema.settings).values({
    key,
    value: JSON.stringify(value),
    updated_at: Date.now(),
  }).onConflictDoUpdate({
    target: schema.settings.key,
    set: { value: JSON.stringify(value), updated_at: Date.now() },
  })
}
```

- [ ] **Step 4: 更新 settings.ts 使用 SQLite**

```typescript
// app/services/settings.ts 重写
import { getSetting, setSetting } from "./storage/settings-store"

export type RuntimeSettings = {
  preferLowPower: boolean
  maxCpuPercent: number
  ollamaModel: string
}

const DEFAULT_SETTINGS: RuntimeSettings = {
  preferLowPower: true,
  maxCpuPercent: 95,
  ollamaModel: "qwen3:1.7b",
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  const settings = await getSetting<RuntimeSettings>("runtime_settings")
  return settings ?? DEFAULT_SETTINGS
}

export async function saveRuntimeSettings(settings: RuntimeSettings): Promise<RuntimeSettings> {
  await setSetting("runtime_settings", settings)
  return settings
}
```

---

## Task 6: 创建向量存储服务 - 聊天切片 & 长期记忆

**Files:**
- Modify: `app/services/db/index.ts` (initSchema 已存在，验证 sqlite-vec)
- Create: `drizzle/0003_memory_vectors.sql`
- Modify: `app/services/db/schema.ts`
- Create: `app/services/storage/memory-vectors.ts`

- [ ] **Step 1: 创建向量表迁移**

```sql
-- drizzle/0003_memory_vectors.sql
CREATE VIRTUAL TABLE IF NOT EXISTS memory_vector_slices USING vec0(
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  session_id TEXT,
  memory_type TEXT NOT NULL,
  embedding FLOAT[1024]
);

CREATE TABLE IF NOT EXISTS memory_slice_metadata (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT,
  memory_type TEXT NOT NULL,
  content_preview TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

- [ ] **Step 2: 扩展 schema.ts**

```typescript
// app/services/db/schema.ts 添加
export const memorySlices = sqliteTable("memory_slice_metadata", {
  id: text("id").primaryKey(),
  session_id: text("session_id"),
  memory_type: text("memory_type").notNull(), // 'conversation' | 'longterm' | 'rag'
  content_preview: text("content_preview").notNull(),
  created_at: integer("created_at").notNull(),
})
```

- [ ] **Step 3: 创建 memory-vectors.ts**

```typescript
// app/services/storage/memory-vectors.ts
import { nanoid } from "nanoid"
import { getSqliteDb } from "~/services/db"
import { getEmbeddings } from "~/services/ollama"

export type MemorySlice = {
  id: string
  session_id: string | null
  memory_type: "conversation" | "longterm" | "rag"
  content: string
  content_preview: string
  created_at: number
}

// 存储聊天切片
export async function addConversationSlice(sessionId: string, content: string): Promise<MemorySlice> {
  const id = nanoid(21)
  const now = Date.now()
  const preview = content.slice(0, 200)
  
  const embedding = await generateEmbedding(content)
  await storeVector(id, content, sessionId, "conversation", embedding)
  
  return { id, session_id: sessionId, memory_type: "conversation", content, content_preview: preview, created_at: now }
}

// 存储长期记忆
export async function addLongtermMemory(content: string): Promise<MemorySlice> {
  const id = nanoid(21)
  const now = Date.now()
  const preview = content.slice(0, 200)
  
  const embedding = await generateEmbedding(content)
  await storeVector(id, content, null, "longterm", embedding)
  
  return { id, session_id: null, memory_type: "longterm", content, content_preview: preview, created_at: now }
}

// 语义搜索记忆
export async function searchMemorySlices(query: string, limit = 10, type?: string): Promise<MemorySlice[]> {
  const queryEmbedding = await generateEmbedding(query)
  if (!queryEmbedding) return []
  
  const sqlite = await getSqliteDb()
  let sql = `
    SELECT m.id, m.session_id, m.memory_type, m.content_preview, m.created_at
    FROM memory_slice_metadata m
    JOIN memory_vector_slices v ON m.id = v.id
    WHERE v.embedding MATCH $1
  `
  const params: unknown[] = [JSON.stringify(queryEmbedding)]
  
  if (type) {
    sql += ` AND m.memory_type = $2`
    params.push(type)
  }
  
  sql += ` ORDER BY distance LIMIT $${params.length + 1}`
  params.push(limit)
  
  const rows = await sqlite.select(sql, params as string[])
  return rows as MemorySlice[]
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    return await getEmbeddings(text)
  } catch {
    return null
  }
}

async function storeVector(id: string, content: string, sessionId: string | null, memoryType: string, embedding: number[] | null): Promise<void> {
  const sqlite = await getSqliteDb()
  const now = Date.now()
  const preview = content.slice(0, 200)
  
  // 存储向量
  if (embedding) {
    await sqlite.execute(
      `INSERT OR REPLACE INTO memory_vector_slices (id, content, session_id, memory_type, embedding) VALUES ($1, $2, $3, $4, $5)`,
      [id, content, sessionId, memoryType, JSON.stringify(embedding)]
    )
  }
  
  // 存储元数据
  await sqlite.execute(
    `INSERT OR REPLACE INTO memory_slice_metadata (id, session_id, memory_type, content_preview, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [id, sessionId, memoryType, preview, now]
  )
}
```

---

## Task 7: 集成聊天切片到 chat.tsx

**Files:**
- Modify: `app/routes/chat.tsx`

- [ ] **Step 1: 添加会话切片存储**

在 `send` 函数成功后的位置添加：

```typescript
import { addConversationSlice, searchMemorySlices } from "~/services/storage/memory-vectors"

// 在 send 函数成功后保存用户消息和助手回复
if (text || attachedFile) {
  await addConversationSlice(assistantId, userContent)
}
```

---

## 自检清单

1. **规范覆盖检查:**
   - [x] AI 角色人设 → MD (Task 1)
   - [x] 系统提示词/Prompt 模板 → MD (Task 4)
   - [x] 个人偏好 → MD (Task 1)
   - [x] 软件设置 → SQLite (Task 5)
   - [x] 会话列表 → SQLite (Task 2-3)
   - [x] 聊天记录切片 → 向量库 (Task 6-7)
   - [x] 跨会话长期记忆 → 向量库 (Task 6)

2. **类型一致性:**
   - `Persona` 类型在所有文件中一致
   - `Session` 类型在所有文件中一致
   - `MemorySlice` 类型在所有文件中一致

3. **无占位符:**
   - 所有代码块包含完整实现
   - 所有 SQL 迁移文件完整
