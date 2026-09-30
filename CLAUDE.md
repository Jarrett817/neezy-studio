# CLAUDE.md

本文件供 Claude Code 在本仓库中协作时参考。

## 项目概述

Neezy Studio 是基于 **Electron** 的本地 AI 桌面应用：主对话走 **pi-coding-agent**（云端/兼容 OpenAI API），本地 GGUF 相关能力已收敛。

- **前端**: React Router 7 + TypeScript + Tailwind CSS v4 + shadcn/ui
- **桌面壳**: Electron + `src/main` / `src/preload`（electron-vite → `out/`）
- **Agent**: `@earendil-works/pi-coding-agent`（Pi 默认 system / skills / 扩展）
- **包管理**: bun

## 开发命令

```bash
bun install
bun run dev          # electron-vite dev
bun run build
bun run typecheck
bun run format
```

## 路由

| 路径 | 页面 |
|------|------|
| `/` | chat.tsx — Pi Agent 对话 |
| `/skills` | skills.tsx |
| `/settings` | settings.tsx |
| `/connect` | connect.tsx |
| `/mcp` | mcp.tsx |
| `/tasks` | tasks.tsx |

## 存储与记忆

- **dataRoot**: Electron `userData`（`app-config.json`、`pi-sessions/`、`soul.md`、`pi-agent/`）
- **工作区**: `app-config.workspaceDir`，Pi `cwd`；可用 **`AGENTS.md`**（Pi 原生 context）
- **Skills**: `~/.agents/skills/`、`<agentDir>/skills`（Pi 扫描）；导入默认写 `~/.agents/skills/`
- **无 `memories.db`**：已废弃向量/SQLite 记忆库；长期文本可用 `soul.md` + `soul_write` 或 Pi `AGENTS.md`

## 关键模块

| 路径 | 用途 |
|------|------|
| `src/main/pi-agent.ts` | Pi 会话、ResourceLoader、IPC Agent |
| `src/main/skill-install.ts` | Skill 导入/列表 |
| `src/renderer/app/services/electron-client.ts` | preload API 类型 |
| `src/renderer/app/hooks/use-pi-agent-chat.ts` | 对话流 |

## 注意事项

- 路径别名 `~/` → `src/renderer/app/`
- 勿改 Pi system prompt（产品层已撤）；集成仅 agentDir、扩展、工具注册
- `PI_CODING_AGENT_DIR` → `userData/pi-agent`

## 编码规范

- **极致精简**：代码量最小化，能一行不写三行。不写注释，不写 JSDoc。
- **不写废话**：输出直接给方案/代码，不解释"为什么这样写"、不总结"做了什么"。
- **无防御性兜底**：信任内部代码和框架保证。只在系统边界（用户输入、外部 API）做校验。不处理不可能发生的状态。
- **不设计未来**：不做"以后可能会用到"的抽象。不做 feature flag。不做向后兼容 shim。
- **复用而非重写**：优先用现有模式和工具函数，不重复造轮子。
