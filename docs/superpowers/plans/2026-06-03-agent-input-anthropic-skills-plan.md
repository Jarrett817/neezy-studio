# Agent 主路径 + Anthropic Skill 实现计划

> **For agentic workers:** 按 P0 → P1 顺序执行；每阶段结束运行 `bun run typecheck`。不新增测试文件，以 typecheck + 手动冒烟为准。

**Goal:** 对话页为主入口；InputProfile 编译进 Agent prompt；Agent 可从 Anthropic 官方 catalog 搜索并安装 Skill。

**Architecture:** Renderer `compilePrompt` → `agent:prompt` → 主进程 pi-agent；Skill 安装走 `anthropic-skills.ts` + catalog；pi `additionalSkillPaths` 指向已安装目录。

**Tech Stack:** pi-coding-agent、Electron IPC、InputProfile/Zod、GitHub raw

**Spec:** `docs/superpowers/specs/2026-06-03-agent-input-anthropic-skills-design.md`

---

## 文件结构（目标态）

```
src/shared/
  anthropic-skill-catalog.ts     # 官方 skill 索引 + pin ref

src/main/
  anthropic-skills.ts            # search / install / list installed
  pi-tool-registry.ts            # + skill_catalog_search, skill_install
  pi-agent.ts                    # additionalSkillPaths → anthropic 目录
  ipc-handlers.ts                # skills:catalog-* / skills:anthropic-install

src/preload/index.ts
src/renderer/app/services/electron-client.ts

src/renderer/app/routes/chat.tsx              # 恢复 + 去掉 sceneSkillIds
src/renderer/app/services/anthropic-skills.ts   # renderer IPC 封装
src/renderer/app/services/workspace.ts        # listSkills 读已安装 anthropic
src/renderer/app/routes/skills.tsx             # 展示 catalog + 安装按钮
```

---

## P0：主对话 + Anthropic Skill 闭环

### Task P0-1: 恢复 `/chat` 主页面

**Files:**
- Modify: `src/renderer/app/routes/chat.tsx`（从 `ebd2bcc` 恢复）

- [ ] 恢复 970 行对话页（侧栏、InputProfile 面板、`usePiAgentChat`）
- [ ] **删除** `sceneSkillIds: scenePlaybook?.skillIds` — Agent 加载全部已安装 skill
- [ ] 保留 `?playbook=` + `compilePrompt` + 场景 system 提示

**验收：** 打开 `/chat` 能发消息、Agent 流式回复；带 `?playbook=xhs-content` 出现输入表单。

---

### Task P0-2: Anthropic Skill Catalog

**Files:**
- Create: `src/shared/anthropic-skill-catalog.ts`

- [ ] 定义 `ANTHROPIC_SKILLS_REF`（pin commit）
- [ ] 内置 entries：`xlsx`, `pdf`, `docx`, `pptx`, `canvas-design` 等（description 来自官方 SKILL frontmatter 摘要）
- [ ] `searchAnthropicSkillCatalog(query)` 纯函数

---

### Task P0-3: 主进程安装与列表

**Files:**
- Create: `src/main/anthropic-skills.ts`
- Modify: `src/main/pi-agent.ts` — `invalidatePiResourceLoaderCache` 安装后调用

- [ ] `getAnthropicSkillRoot(dataRoot)` → `{dataRoot}/skills/anthropic`
- [ ] `listInstalledAnthropicSkills()` — 扫描含 `SKILL.md` 的子目录
- [ ] `installAnthropicSkill(id)` — raw 拉取 `SKILL.md` + catalog 声明的 `referenceFiles`
- [ ] 安装后 `invalidatePiResourceLoaderCache()`

---

### Task P0-4: Agent 工具

**Files:**
- Modify: `src/main/pi-tool-registry.ts`

- [ ] `skill_catalog_search({ query })` → 匹配 catalog + `installed: boolean`
- [ ] `skill_install({ skillId })` → 调用 `installAnthropicSkill`

---

### Task P0-5: IPC + Renderer 封装

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/app/services/electron-client.ts`
- Create: `src/renderer/app/services/anthropic-skills.ts`

- [ ] `skills:catalog-search` / `skills:anthropic-list` / `skills:anthropic-install`
- [ ] Renderer `searchSkillCatalog` / `listInstalledAnthropicSkills` / `installAnthropicSkill`

---

### Task P0-6: pi-agent Skill 路径

**Files:**
- Modify: `src/main/pi-agent.ts`

- [ ] `resolveAdditionalSkillPaths` 返回各 `skills/anthropic/{id}` 目录 + bundled
- [ ] 忽略 `sceneSkillIds` 过滤（参数保留兼容，行为改为全量 anthropic）

---

### Task P0-7: Skills 管理页接线

**Files:**
- Modify: `src/renderer/app/services/workspace.ts`
- Modify: `src/renderer/app/routes/skills.tsx`

- [ ] `listSkills` 合并已安装 Anthropic skill（读 frontmatter description）
- [ ] UI：官方 catalog 列表 +「安装」按钮（调用 IPC）
- [ ] 移除/隐藏「导入 zip / 文件夹」（与仅 Anthropic 策略冲突）

**P0 验收：** typecheck 通过；对话可用；Studio Skills 页可安装 xlsx；Agent 工具可搜索并安装。

---

## P1：输入扩展 + Playbook 降级（后续）

### Task P1-0: 输入场景持久化与反复编辑

- `InputProfile` 增加 `name` / `description` / `updatedAt`
- 用户场景存 `{inputProfilesDir}/user/{id}.json`，可新建 / 编辑 / 删除
- 填表草稿按 **profile id** 存 localStorage（`input_scene_slots_v1:`）
- `/studio/input-profiles` 管理；`/chat?profile=` 或 `?playbook=` 使用
- 对话侧栏「编辑输入场景」链到编辑页

### Task P1-1: mindmap / flowchart 字段

**Files:**
- Modify: `src/renderer/app/services/playbook/types.ts`
- Modify: `src/renderer/app/services/playbook/compile-prompt.ts`
- Modify: `src/renderer/app/components/playbook/playbook-input-form.tsx`
- Add deps: `@xyflow/react`、mindmap 库（选型后 `bun add`）

- [x] Zod 扩展 `mindmap | flowchart`
- [x] serializer：`mindmapToMarkdown` / `flowchartToText`
- [x] 表单渲染组件（`mindmap-field` / `flowchart-field` + `@xyflow/react`）

---

### Task P1-2: Playbook 入口统一走 Chat

**Files:**
- Modify: `src/renderer/app/routes/create.tsx`
- Modify: `src/renderer/app/routes/playbook-run.tsx`

- [x] 场景卡片「运行」→ `/chat?playbook={id}`
- [x] `/create/:id` 重定向到 chat

---

### Task P1-3: Agent 动态 InputProfile

- [ ] Agent 输出 `inputProfile` JSON schema → 对话页临时渲染
- [ ] 用户填完再 `compilePrompt` 发送

---

### Task P1-4: skill_install 首次确认

- [ ] 复用 `agent-permission-dialog` 或 pi permission UI

---

## 手动冒烟清单

1. `/connect` 配好模型 → `/chat` 发「你好」
2. `/chat?playbook=xhs-content` → 富文本填空 → 发送
3. 对话：「搜索 xlsx skill 并安装」→ 工具调用成功 → 磁盘出现 `skills/anthropic/xlsx/SKILL.md`
4. `/studio/skills` 看到已安装 xlsx，可刷新

---

## 明确不做

- MCP、Flowgram、开放 skill 市场、执行 skill scripts
