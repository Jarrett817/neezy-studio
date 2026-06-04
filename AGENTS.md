# AGENTS.md

本文件供 Claude Code 在本仓库中协作时参考。

## 项目概述

Neezy Studio 是基于 **Electron** 的本地 AI 桌面应用：场景化 Playbook、记忆检索、对话驱动的人格画像，模型为本地 **GGUF**（通过 Ollama）或远程 API。

- **前端**: React Router 7 + TypeScript + Tailwind CSS v4 + shadcn/ui + TanStack Query + Zustand
- **桌面壳**: Electron 42 + `src/main/`（IPC、文件、SQLite、模型下载）→ `dist-electron/`
- **Agent 运行时**: `@earendil-works/pi-agent-core` + `@earendil-works/pi-coding-agent`（Session 管理、工具循环、事件流）
- **对话推理**: 主进程 `pi-agent.ts`（Ollama 式 GPU 自动分层）或 `openai-compatible` 端点
- **Embedding**: 主进程 `embedding-runtime.cjs`（`node-llama-cpp`）
- **数据库**: SQLite（Drizzle ORM + 主进程 `node:sqlite`，经 IPC）
- **模型下载**: `@huggingface/hub`（`model-download.cjs`，hf-mirror 回退官方源）
- **包管理**: bun

## 开发命令

```bash
bun install

# Electron 开发（tsc -w 热编译 + nodemon 重启主进程 + Vite）
bun run electron:dev

# 仅前端
bun run dev

# 生产：先构建前端再启动 Electron
bun run electron:start

bun run typecheck
bun run format
bun run build
```

## 架构

```
┌──────────────────────────────────────────────────────────────────┐
│  Renderer (src/renderer/)                                         │
│  React Router 7 · TanStack Query · Zustand                          │
│  playbook/runner.ts → agent-prompt.ts → pi-agent-client.ts (IPC)    │
│  memories.ts → vector-store.ts (Embedding 检索)                     │
│  storage/skills.ts → Skill .md 文件                                 │
└────────────────────────────┬─────────────────────────────────────┘
                              │ preload (electronAPI)
┌─────────────────────────────▼─────────────────────────────────────┐
│  Main (src/main/)                                                    │
│  pi-agent.ts · pi-tool-registry.ts · pi-bundled-extensions.ts      │
│  pi-disk-sessions.ts · pi-llm.ts · pi-permission-ui.ts             │
│  pi-sdk-auth.ts · llm-presets.ts · model-catalog.cjs                 │
│  node:sqlite · @huggingface/hub                                     │
└──────────────────────────────────────────────────────────────────┘
```

## 路由 (src/renderer/src/App.tsx)

| 路径 | 页面 |
|------|------|
| `/` | workbench.tsx — 工作台（今日待办、最近草稿） |
| `/create` | create.tsx — 场景卡片列表（首屏） |
| `/create/:playbookId` | playbook-run.tsx — **场景运行页**（表单 → runPlaybook → 结果） |
| `/scenes/:playbookId` | scene-detail.tsx — 场景配置详情 |
| `/chat` | chat.tsx — 通用对话（历史） |
| `/knowledge` | knowledge.tsx — 记忆 + 知识库 |
| `/models` | models.tsx — 模型下载管理 |
| `/settings` | settings.tsx — 存储路径、运行时、Provider |
| `/studio` | studio/ — 管理后台（Skills / InputProfile / PlaybookDesigner） |
| `/studio/skills` | skills.tsx — Skill 管理 |
| `/studio/input-profiles` | input-profiles.tsx — 输入模板管理 |
| `/studio/playbook-designer` | playbook-designer.tsx — 对话创建场景 |

## 关键模块

| 路径 | 用途 |
|------|------|
| `src/renderer/app/services/pi-agent-client.ts` | `createAgentSession` / `promptAgent` / `subscribeAgentEvents`（IPC 封装） |
| `src/renderer/app/services/agent-prompt.ts` | `promptAgentOnce` — 一次性 agent 调用，返回 `{content, thinking}` |
| `src/renderer/app/services/playbook/runner.ts` | **PlaybookRunner** — retrieve → skill → llm → parse:output 流水线 |
| `src/renderer/app/services/playbook/types.ts` | Playbook / InputProfile / MemoryScope Zod 类型 |
| `src/renderer/app/services/playbook/compile-prompt.ts` | `compilePrompt` — slots + persona + memories + skillBlock → 最终 prompt |
| `src/renderer/app/services/playbook/extract-slots.ts` | `normalizeSlots` / `extractSlotsFromSingleLine` / `buildMemoryQuery` |
| `src/renderer/app/services/playbook/storage.ts` | `listPlaybooks` / `getPlaybook` / `listInputProfiles` / `getInputProfile` |
| `src/renderer/app/services/memories.ts` | 记忆 CRUD + `searchMemories`（向量检索 + 文本兜底） |
| `src/renderer/app/services/storage/skills.ts` | `listSkills` 读取 `skillsDir/*.md` → Skill 对象 |
| `src/main/pi-agent.ts` | 主进程 AgentSession 生命周期管理，工具注册 |
| `src/shared/pi-sdk.ts` | `@earendil-works/pi-*` 类型统一导出 |
| `src/shared/agent-scene.ts` | `AgentSceneConfig { skillIds }` — 场景技能配置 |

## 场景（Playbook）与编排

**场景是用户首屏入口**，组合 Skill + 记忆 + 输入模板，共用一条 PlaybookRunner，差异仅在配置。

### playbook.json 结构

```json
{
  "id": "xhs-content",
  "name": "小红书内容包",
  "inputProfileId": "xhs-minimal",
  "memoryScope": { "categories": ["记忆","xhs","knowledge"], "topK": 5 },
  "skillIds": ["xhs-copy"],
  "defaultSkillId": "xhs-copy",
  "steps": ["retrieve", "skill", "llm", "parse:output"],
  "outputSchema": { "properties": { "items": { "type": "array" } } }
}
```

### PlaybookRunner 流水线 (runner.ts)

```
buildMemoryQuery(slots)
  → searchMemories(query, topK)         ← 真实向量检索（memories.ts）
  → filterMemoriesByScope(categories)
  → formatMemories() → {{retrievedMemories}}

listSkills() → resolveSkillBlock(skills, skillId)
  → "## {name}\n{description}\n{instructions}\n{prompt}" → {{skillBlock}}

compilePrompt(profile, { slots, persona, retrievedMemories, skillBlock })
  → promptTemplate 填充所有 {{token}}

buildLlmMessages(compiled, skillBlock)
  → [{ role: "system", content: skillBlock + "请严格按..." }, { role: "user", content: compiled }]

promptAgentOnce(messages)              ← pi-agent-core one-shot session

parseJsonFromLlm(rawText)             ← 提取 JSON（有容错恢复）
```

### InputProfile 的 capture 策略 (types.ts)

- `form` — 极简表单，1~3 必填 + 补充说明
- `chips` — 枚举字段点选，不用打字
- `singleLineExtract` — 单句抽槽（大模型从一句话提取 slots）
- `slotFilling` — 对话填槽，逐个追问缺槽
- `inheritPersona` — 从画像自动注入 `{{persona}}`

## 存储路径

用户可在设置中配置（小配置文件在系统 `userData`，大文件在用户指定盘）：

- `dataRoot` — `memories.db`、`memories/`、`personas/`、`skills/`、`playbooks/`
- `modelsDir` — `.gguf` 对话与 Embedding 模型

代码中统一使用 `getStoragePaths()` 取路径字段，不要再加仅转调一层的包装函数。

## 模型

- **对话**: `@earendil-works/pi-coding-agent` 通过 Ollama 或 `openai-compatible`；同时仅加载一个 GGUF；按显存自动分配 GPU 层数
- **Embedding**: 主进程单独加载（如 Nomic Embed，768 维，与 sqlite-vec 表一致）
- **下载**: catalog 中 `repo` + `repoPath`，经 `@huggingface/hub` 流式落盘
- **推荐**: `app:get-runtime-metrics` / `getModelRecommendations` 返回 `chatTier`、`embeddingTier` 与推荐模型 id

## IPC 要点 (preload → main)

- `agent:create` / `agent:configure` / `agent:prompt` / `agent:abort` / `agent:destroy` / `agent:event`
- `getStoragePaths` / `saveStoragePaths`
- `getModelCatalog(kind?: 'chat' | 'embedding')`
- `downloadModel` / `deleteModel`
- `loadEmbeddingModel` / `getEmbeddings`
- `sqlite:execute` / `sqlite:select`
- `fs:*`、`path:*`

## 数据库

- 主库: `{dataRoot}/memories.db`（Drizzle + IPC sqlite）
- 向量表: `memory_embeddings`、`memory_vector_slices`（vec0，768 维，需 Embedding 模型已加载）
- 设置: `settings` 表（如 `runtime_settings`、`user_portrait_v1`）

## 注意事项

- 路径别名 `~/` → `./src/renderer/`（vite alias）
- 旧 `app/` / `electron/` 目录已迁移到 `src/renderer/` / `src/main/`；AGENTS.md 旧版描述作废
- 人格画像由对话自动更新，不在设置页手填人设
- `workspace.ts` 中的 `ContentAgentInput` / `ContentAgentOutput` 是遗留 stub，Playbook 不使用它们
- `getRelevantKnowledge`（workspace.ts）是空 stub；真正的记忆检索在 `runner.ts` → `searchMemories`
- 场景卡片「开始创作」链接到 `/create/:playbookId`（PlaybookRunRoute），不是 `/chat`
- 修改存储路径后需 `resetDbCache()`，并提示用户迁移数据 / 重启
