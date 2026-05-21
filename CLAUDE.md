# CLAUDE.md

本文件供 Claude Code 在本仓库中协作时参考。

## 项目概述

Neezy Studio 是基于 **Electron** 的本地 AI 桌面应用：对话 Agent、记忆检索、对话驱动的人格画像，模型均为本地 **GGUF**。

- **前端**: React Router 7 + TypeScript + Tailwind CSS v4 + shadcn/ui
- **桌面壳**: Electron 42 + `electron/*.ts` → `dist-electron/`（IPC、文件、SQLite、模型下载）
- **对话推理**: 主进程 `electron/chat-llm-runtime.cjs`（`node-llama-cpp`，IPC；Ollama 式 GPU 自动分层）
- **Embedding**: 主进程 `electron/embedding-runtime.cjs`（`node-llama-cpp`）
- **数据库**: SQLite（Drizzle ORM + 主进程 `node:sqlite`，经 IPC）
- **模型下载**: `@huggingface/hub`（`electron/model-download.cjs`，hf-mirror 回退官方源）
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

bun run db:generate
bun run db:studio
```

## 架构

```
┌──────────────────────────────────────────────────────────┐
│  Renderer (app/)                                           │
│  React Router 7 · TanStack Query · Zustand                 │
│  llm.ts → electronAPI 对话 IPC (node-llama-cpp)             │
└─────────────────────────┬────────────────────────────────┘
                          │ preload (electronAPI)
┌─────────────────────────▼────────────────────────────────┐
│  Main (electron/*.ts → dist-electron/)                     │
│  main.ts · storage-paths.ts · model-catalog.ts             │
│  model-download.ts · chat-llm-runtime.ts · embedding-runtime.ts │
│  node:sqlite · @huggingface/hub                              │
└──────────────────────────────────────────────────────────┘
```

## 路由 (app/routes.ts)

| 路径 | 页面 |
|------|------|
| `/` | chat.tsx — Agent 对话 |
| `/portrait` | portrait.tsx — 人格画像（对话自动归纳，可导出 MD） |
| `/knowledge-base` | knowledge-base.tsx — 记忆列表 |
| `/skills` | skills.tsx — Skill |
| `/settings` | settings.tsx — 存储路径、运行时、本地模型 |

## 关键模块

| 路径 | 用途 |
|------|------|
| `app/services/electron-client.ts` | 所有 `window.electronAPI` 的类型与封装 |
| `app/services/storage-paths.ts` | 可配置数据目录 / 模型目录（`getStoragePaths()`） |
| `app/services/llm.ts` | 对话 load/chat/stream（主进程 node-llama-cpp）；Embedding 经 IPC |
| `app/services/settings.ts` | `runtime_settings`（llmModel、embeddingModel、档位等） |
| `app/services/user-portrait.ts` | 对话更新人格画像、导出 Markdown |
| `app/services/memories.ts` | 记忆 CRUD + 向量检索 |
| `app/services/fs-memory.ts` | 记忆 Markdown 文件读写 |
| `app/agents/llm-agent.ts` | ReAct 工具循环 |
| `app/components/llm-model-browser.tsx` | 对话 / Embedding 模型分档选择与下载 |
| `electron/model-catalog.cjs` | 模型目录（轻量 / 中等 / 高性能） |
| `electron/model-recommendations.cjs` | 按内存与负载推荐模型 |

## 存储路径

用户可在设置中配置（小配置文件在系统 `userData`，大文件在用户指定盘）：

- `dataRoot` — `memories.db`、`memories/`、`personas/`、`skills/`
- `modelsDir` — `.gguf` 对话与 Embedding 模型

代码中统一使用 `getStoragePaths()` 取路径字段，不要再加仅转调一层的包装函数。

## 模型

- **对话**: `node-llama-cpp`，同时仅加载一个 GGUF；非低功耗时按显存自动分配 GPU 层数
- **Embedding**: 主进程单独加载（如 Nomic Embed，768 维，与 sqlite-vec 表一致）
- **下载**: catalog 中 `repo` + `repoPath`，经 `@huggingface/hub` 流式落盘
- **推荐**: `app:get-runtime-metrics` / `getModelRecommendations` 返回 `chatTier`、`embeddingTier` 与推荐模型 id

## IPC 要点 (preload → main)

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

- 路径别名 `~/` → `./app/`
- 无 `src-tauri`；勿使用 Tauri / mistralrs / `invoke` 等旧描述
- 人格画像由对话自动更新，不在设置页手填人设
- 修改存储路径后需 `resetDbCache()`，并提示用户迁移数据 / 重启
