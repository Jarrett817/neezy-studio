# Agent 主路径 + 多形态输入 + Anthropic Skill 设计

**状态**：已确认，实施中  
**日期**：2026-06-03  

**锁定决策**：

| 项 | 选择 |
|----|------|
| 主运行时 | **通用 pi-agent**（ReAct + 内置工具） |
| 输入 | **InputProfile**（form / rich-text / 后续 mindmap / flowchart）→ `compilePrompt` |
| Skill 来源 | **仅** [anthropics/skills](https://github.com/anthropics/skills) 官方目录 |
| Skill 使用 | Agent **自行** `skill_catalog_search` + `skill_install`，不绑 Playbook 白名单 |
| MCP | **不做** |
| Playbook | 降级为「默认 InputProfile + 任务元数据」快捷入口；**不**走 `runPlaybook` 线性流水线 |
| Skill scripts | MVP **不执行** `scripts/`；仅安装 `SKILL.md` + `references/` 文本 |

**关联**：`docs/playbook-场景与编排架构.md`（InputProfile / compile 部分仍有效）

---

## 1. 目标

1. 用户打开 **对话页** 即可完成主任务：多种输入形态 → 编译 prompt → Agent 执行。
2. Agent 可从 **官方 Anthropic Skill 目录** 搜索并安装 Skill，安装后自动进入 pi 资源加载器。
3. 保留富文本填空、表单等已有 InputProfile 能力；思维导图 / 流程图在 P1 扩展（JSON → serializer）。

---

## 2. 架构

```
InputProfile（预置 / 会话绑定 / 未来 Agent 动态下发）
    ↓ compilePrompt(slots)
compiled user message
    ↓ agent:prompt
pi-agent（主进程）
    ├── 工具：memory_*、skill_catalog_search、skill_install、…
    └── Skills：skills/anthropic/{id}/SKILL.md + bundled pi-web-access
```

### 2.1 输入层

- **Playbook 入口**：`/chat?playbook={id}` 或会话绑定 `inputProfileId`，右栏渲染 `PlaybookInputForm`。
- **字段类型（现状）**：`text | textarea | number | enum | rich-text`。
- **字段类型（P1）**：`mindmap | flowchart`，值为库导出的 JSON；`compilePrompt` 增加 serializer。
- **发送**：`buildSceneUserContent` = compiled + 补充说明 + 附件。

### 2.2 Skill 层

**目录**：

```
{dataRoot}/skills/anthropic/{skillId}/
  SKILL.md
  references/   # 可选，P0 按 catalog 清单拉取
```

**Catalog**（应用内置，`src/shared/anthropic-skill-catalog.ts`）：

- `repo`: `anthropics/skills`
- `ref`: 固定 commit（可随版本 bump）
- `entries[]`: `{ id, subpath, description }`

**安装**：主进程从 `raw.githubusercontent.com` 拉取文件落盘 → `invalidatePiResourceLoaderCache()`。

**Agent 工具**：

| 工具 | 作用 |
|------|------|
| `skill_catalog_search` | 在 catalog 中按关键词搜索（含已安装状态） |
| `skill_install` | 按 id 安装官方 skill（MVP 直接安装；P1 首次安装弹窗确认） |

### 2.3 Playbook 降级

- `/create/:id` 短期保留 `runPlaybook`；中期改为跳转 `/chat?playbook=:id`。
- 删除 Playbook 上 **手选 Skill**、**sceneSkillIds 过滤**。
- `playbook-designer` 可继续生成 InputProfile + 元数据，不生成 `steps` 流水线。

**输入场景持久化（P1）**

- 用户场景：`{inputProfilesDir}/user/{id}.json`，含 `name` / `description` / `fields` / `promptTemplate`
- 填表草稿：`localStorage` 键 `input_scene_slots_v1:{profileId}`，修改即保存
- 使用：`/chat?profile={id}` 或 Playbook 绑定的 `inputProfileId`
- 管理：`/studio/input-profiles` 新建 / 编辑 / 删除

---

## 3. 非目标（YAGNI）

- Flowgram 工作流引擎
- MCP 服务器
- 用户上传 /  sideload Skill
- 执行 Anthropic skill 包内 `scripts/`
- 远程自建 Skill CDN（MVP 用内置 catalog + GitHub raw）

---

## 4. 验收（P0）

1. `/chat` 可对话，挂载 InputProfile（`?playbook=`）时富文本/表单可用。
2. Agent 调用 `skill_catalog_search` 能返回 xlsx 等条目。
3. `skill_install` 后 `{dataRoot}/skills/anthropic/xlsx/SKILL.md` 存在，下一轮 Agent 可加载。
4. `bun run typecheck` 通过。

---

## 5. 风险

| 风险 | 缓解 |
|------|------|
| GitHub raw 不可用 | catalog pin commit；失败提示重试 |
| pi 不识别目录式 skill | `additionalSkillPaths` 传各 `anthropic/{id}` 目录 |
| 旧扁平 `skills/*.md` | 保留扫描兼容；新 skill 只走 anthropic 目录 |
