# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Neezy Studio 是一个基于 Tauri 的本地内容生成桌面应用，使用本地 GGUF 格式大模型进行 Agent 编排。

- **前端**: React Router 7 + TypeScript + Tailwind CSS v4 + shadcn/ui
- **后端**: Tauri 2.x + Rust + mistralrs (本地 LLM 推理)
- **数据库**: SQLite (rusqlite)
- **模型格式**: GGUF
- **包管理**: bun

## 开发命令

```bash
# 安装依赖
bun install

# 开发模式
bun tauri dev

# 生产构建
bun tauri build

# 类型检查
bun run typecheck

# 代码格式化
bun run format

# 前端单独构建
bun run build

# 前端单独开发服务器
bun run dev
```

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (app/)                      │
│  React Router 7 + TanStack Query + Zustand + Tailwind  │
└─────────────────────┬───────────────────────────────────┘
                      │ Tauri IPC (invoke)
┌─────────────────────▼───────────────────────────────────┐
│                 Backend (src-tauri/)                    │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ llm_runtime │  │ agent/       │  │ storage/      │  │
│  │ (mistralrs)│  │ memory.rs    │  │ db.rs (SQLite) │  │
│  │             │  │ skill.rs     │  │ settings.rs    │  │
│  │             │  │ react.rs    │  │                │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│  ┌─────────────┐  ┌──────────────────────────────────┐  │
│  │ models/     │  │ lib.rs (Tauri commands + metrics)│  │
│  │ download.rs│  │                                  │  │
│  │ resolve.rs │  │                                  │  │
│  └─────────────┘  └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 关键模块

### 前端 (app/)

| 路径 | 用途 |
|------|------|
| `app/agents/content-agent.ts` | Content Agent 编排逻辑：setup → knowledge → plan → write → review |
| `app/services/workspace.ts` | 所有 Tauri IPC 调用的入口，定义关键类型 |
| `app/routes.ts` | 路由配置 (React Router 7) |
| `app/components/app-shell.tsx` | 主布局：侧边栏 + 顶部状态栏 |
| `app/stores/app-store.ts` | Zustand 状态管理 |

**路由**:
- `/` → home.tsx (工作台)
- `/creator` → creator.tsx (内容生成对话)
- `/knowledge-base` → knowledge-base.tsx
- `/skills` → skills.tsx
- `/import` → import.tsx
- `/analytics` → analytics.tsx
- `/settings` → settings.tsx

### 后端 (src-tauri/)

| 文件 | 职责 |
|------|------|
| `src-tauri/src/lib.rs` | 主入口，注册 25+ Tauri commands，运行时指标计算 |
| `src-tauri/src/llm_runtime.rs` | mistralrs 封装：文本生成、embedding、模型缓存 |
| `src-tauri/src/agent/memory.rs` | RAG 检索：embedding 生成 + cosine similarity |
| `src-tauri/src/agent/skill.rs` | Skill 系统：SKILL.md 解析、skill 执行、import/export |
| `src-tauri/src/agent/react.rs` | ReAct Agent 循环 (最多 10 步) |
| `src-tauri/src/models/resolve.rs` | 模型选择：根据 pressure/内存推荐模型 |
| `src-tauri/src/models/download.rs` | 模型下载：12 个可下载 GGUF 模型 |
| `src-tauri/src/storage/db.rs` | SQLite：knowledge_items, memory_events, embeddings |

## Content Agent 流程

`app/agents/content-agent.ts` 中的 `runContentAgent()` 实现多阶段管道：

1. **setup** - 加载账户配置、模型设置、技能
2. **knowledge** - 从向量存储检索相关知识
3. **plan** - 使用 planner 模型生成大纲 (高负载时可跳过)
4. **write** - 使用 writer 模型生成正文 (流式)
5. **review** - 使用 reviewer 模型生成标签 (可走快速路径)

**模型套件解析** (`resolveModelSuite`):
- `manual-single-model`: 用户指定精确模型路径
- `auto-single-model`: 单模型处理 plan/write/review
- `auto-suite`: 不同模型分别处理 plan/writer/reviewer

**自适应行为**:
- 高压或内存 < 8GB 时跳过 knowledge retrieval 和 planning
- 动态 token limit: 高压 640，正常 1200

## Tauri IPC 模式

所有后端调用通过 `invokeTauri()` 封装在 `app/services/workspace.ts`:

```typescript
// 典型调用模式
const result = await invokeTauri('get_relevant_knowledge', { query, topK });
```

关键命令: `generate_text_stream`, `get_relevant_knowledge`, `list_skills`, `resolve_llm_model`, `get_runtime_metrics`

## 系统压力检测

后端根据 CPU 和内存计算压力等级 (high/medium/low)：
- **high**: CPU ≥70% 或内存 <4GB
- **medium**: CPU ≥45% 或内存 <8GB
- **low**: 其他

压力等级决定运行时参数：线程数、上下文大小、批处理大小、GPU 使用

## 模型管理

- 模型存储在 `models/` 目录
- 使用 mistralrs 加载 GGUF 模型
- 支持 CUDA GPU 加速 (自动检测)
- 模型缓存: `TEXT_MODEL_CACHE` / `EMBEDDING_MODEL_CACHE`
- 默认下载源: `hf-mirror.com`

## 数据库

SQLite 数据库 (`neezy-memory.sqlite`) 位于应用数据目录:
- `account_profile` - 用户账户设置
- `knowledge_items` - RAG 知识库
- `memory_events` - 事件日志
- `memory_embeddings` - 向量 embedding 存储

## 注意事项

- React Router 7 使用 `app/` 目录而非传统 `src/`
- 路径别名 `~/` 映射到 `./app/`
- shadcn/ui 组件在 `app/components/ui/`，使用 `class-variance-authority` 定制
- 取消生成: `CANCEL_GENERATION` atomic flag 在 `llm_runtime.rs`
