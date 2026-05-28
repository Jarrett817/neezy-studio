# Playbook（场景）与编排架构

> 本文档沉淀产品/架构讨论结论，与 [小红书博主 AI 运营工作台 · 最终端侧版产品文档](./小红书博主AI运营工作台%20·%20最终端侧版产品文档.md) 对齐。  
> 实现可分阶段推进；未接入能力不展示假结果（与产品文档原则一致）。

## 1. 为什么要做「场景」

通用 Agent + 自然语言 + 自主检索 + 自主选 Skill，**能力上**可以覆盖多数任务。  
对会写 prompt 的用户，单独做场景价值有限。

目标用户是**不会技术的运营、客服、小红书博主**时，场景解决的不是「模型能不能做到」，而是：

| 问题 | 场景的作用 |
|------|------------|
| 输出结构每次不一样 | 固定 `outputSchema`，便于展示、导出、再生成 |
| 不知道该怎么问 | 任务卡片 + 少量必填项 + 可选「补充说明」 |
| 检索搜错库、搜太多 | `memoryFilter` 作为默认先验，缩小召回范围 |
| 演示与定价说不清 | 一次提交 = 一次任务（可计量） |
| 回归测试难 | 每个场景有固定用例与契约 |

**场景 ≠ 另一套 Agent 运行时。**  
**场景 = 同一套编排器上的「配方 + 产品外壳」。**

---

## 2. 三层概念（正交）

```
┌─────────────────────────────────────────────────────────┐
│  Playbook（场景）  入口、表单、步骤、产物、计费叙事      │
├─────────────────────────────────────────────────────────┤
│  Skill            领域说明、格式、references、scripts    │
├─────────────────────────────────────────────────────────┤
│  LLM Provider     Base URL、API Key、模型名；默认探测 Ollama │
└─────────────────────────────────────────────────────────┘
```

| 概念 | 职责 | 用户是否常接触 |
|------|------|----------------|
| **LLM Provider** | 调用哪家模型、哪个 endpoint | 设置页一次配置 |
| **Skill** | 怎么写、什么语气、用什么工具 | 高级 / 导入包；可被场景引用 |
| **Playbook** | 完成哪类任务、交什么、拿走什么 | **首屏任务卡片** |

流水线对**所有场景相同**（只实现一次）：

```
检索记忆/知识库 → 选 Skill（可路由）→ 调 LLM → 校验（可选）→ 存草稿 / 导出
```

场景差异体现在**配置**，而非复制整条管道代码。

---

## 3. 场景区分什么（配置维度）

同一条 `PlaybookRunner`，不同 `playbookId` 加载不同配置：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `formSchema` | 首屏字段（宜少）；其余进「补充说明」 | 选题、链接、条数 |
| `memoryFilter` | 检索先验（标签/分类/topK），非硬墙 | `category: xhs` |
| `defaultSkillIds` | 默认主 Skill | `xhs-copy` |
| `allowedSkillIds` | 路由器可选白名单；可含 `*` | 允许 fallback 到 `cs-reply` |
| `steps` | 可选插件步骤 | 违禁词、拆 N 条、归纳 FAQ |
| `outputSchema` | 结构化产物 | `title, body, tags[]` |
| `persist` | 写入草稿库 / 话术库 / 画像 | `drafts` |
| `export` | 复制格式、Markdown、CSV | 小红书发布块 |

**表单与自然语言不互斥**：推荐「极简字段 + 大段补充说明」；高级用户仍可用自由对话（收在「高级」或场景内二级入口）。

**Skill 不锁死**：场景提供 **默认 + 白名单**；编排器或轻量路由在候选集内选择，用户可手动切换 Skill。

**检索不锁死**：`memoryFilter` 是默认先验；Agent 仍可通过工具扩大检索，但默认更准、更省 token。

---

## 4. 是否等于「预置场景」？

**是，MVP 阶段以官方预置为主。**

建议目录（与现有 `skillsDir` 并列）：

```
{dataRoot}/
  playbooks/
    builtin/          # 随应用发布或首次启动拷贝（只读模板）
      xhs-content/
        playbook.json
      cs-reply/
        playbook.json
    user/             # 用户创建 / 从 builtin 复制修改
      my-shop-copy/
        playbook.json
  skills/             # 已有；场景通过 skillId 引用
```

首版 shipped 场景建议 **2～3 个**（与产品文档「创作中心」等对齐），例如：

1. **小红书内容包** — 选题/链接 → 多条文案 + 标签 → 草稿库  
2. **客服话术** — 粘贴对话 → 回复建议 + FAQ 条目 → 话术库  
3. （可选）**品牌语气** — 上传 SOP → 更新全局语气摘要，供其它场景引用  

用户打开应用看到的是 **任务卡片**，不是「Playbook 列表」术语。

---

## 5. 场景的本质定义（与 Skill / 记忆的关系）

你的理解基本正确，建议再补上 **产物与流水线** 两项，避免场景退化成「三个配置的文件夹」：

```
Playbook（场景）=
  InputProfile（标准化用户输入 → 编译成精准 prompt）
+ MemoryScope（定向记忆：检索范围、topK、是否必选条目）
+ SkillSet（默认 Skill + 可选白名单，用户可自由组合勾选）
+ OutputContract（输出 JSON 形态、导出模板）
+ Steps（共用 PlaybookRunner 上的步骤序列）
```

| 模块 | 用户能否自由组合 | 管理界面 |
|------|------------------|----------|
| **Skill** | 是；场景内多选 `skillIds` | Skill 管理（已有 `/skills`） |
| **记忆/知识库** | 是；按分类、标签、手选条目 | 记忆/知识库（已有 `/knowledge-base` 等） |
| **InputProfile** | 是；可跨场景复用同一套表单 | **输入模板**（需新建，见 §8） |
| **Playbook** | 引用上述三者 + 定产物 | **场景**（列表 / 运行 / 编辑） |

**场景不是替代 Skill/记忆管理**，而是把它们 **编排成一次可重复的任务**；三块资源仍独立维护，场景只做引用与默认组合。

---

## 6. 用户自建场景：对话创建为主路径

目标：**预置场景 + 用户自定义**；创建场景时 **优先用对话**，结构化界面用于确认与微调（不是让用户手写 JSON）。

### 6.1 对话创建流程（Playbook Designer）

专用内置场景 `playbook-designer`（或设置页入口「用对话创建场景」）：

```
用户自然语言描述意图
  → Designer Agent 追问缺失项（一次一问，宜短）
  → 生成 draft：playbook.json + 关联 skillIds + memoryScope + inputProfile
  → 右侧结构化预览（可改多选 Skill、记忆范围、表单字段）
  → 用户确认保存 → playbooks/user/{id}/
```

Designer 需产出的最小集合：

- 场景名称、一句话描述、图标建议  
- 绑定哪些 Skill（可多选；若无合适 Skill 可建议「新建 Skill」并跳转）  
- 记忆范围：分类/标签/是否允许运行时再扩搜  
- InputProfile：`fields` + `promptTemplate`（见 §7）  
- 输出形态：标题+正文 / 话术列表 / FAQ 等  

**原则：** 对话负责 **收集意图与生成草案**；保存前必须经过 **结构化预览**（避免黑盒 JSON）。

### 6.2 其它创建方式（辅助）

| 方式 | 适用 |
|------|------|
| 复制官方场景再改 | 与官方场景相近的变体 |
| 导入场景包 | 代运营、社区分发 |
| 高级 JSON 编辑 | 内部/代运营，非主路径 |

### 阶段建议

| 阶段 | 能力 |
|------|------|
| A | 官方预置场景 + Skill/记忆管理 |
| B | **对话创建场景** + 结构化确认页 |
| C | 复制 / 导入场景包；InputProfile 库可复用 |
| D | 场景内 A/B 测不同 InputProfile（可选） |

---

## 7. 用户输入标准化：少打字、准 prompt

核心：**用户侧只收集「槽位」（slots）**；**编译层**把 slots + Skill + 召回记忆 合成最终发给 LLM 的消息。  
用户永远不需要看到完整 system prompt（高级模式可预览）。

### 7.1 三层结构

```
[ 采集层 ]  用户最少操作 → 填满 slots
[ 规范化 ]  校验、默认值、缺槽追问
[ 编译层 ]  inputProfile.promptTemplate + skill + memories → messages[]
```

### 7.2 采集方式（可组合，写入 InputProfile.capture）

按 **打字量从少到多** 排列；一个场景可选用多种，默认用最省事的：

| 方式 | 用户操作 | 适用 | 精准度依赖 |
|------|----------|------|------------|
| **① 意图芯片** | 点选「仿爆款」「口语」「3条」 | 枚举型参数 | 预置选项，最稳 |
| **② 单句智能解析** | 只写一句话 | 「这条链接写3条口语笔记」 | 本地/云端小模型或规则 **抽槽** → `slots` |
| **③ 对话填槽** | 先点场景，AI 逐问缺项 | 新手、复杂任务 | 每轮只问 1 个槽，避免问卷感 |
| **④ 极简表单** | 1～3 个必填 + 补充说明 | 演示、可重复 | 字段即 slots，无歧义 |
| **⑤ 从记忆点选** | 勾选知识库条目，不描述 | 强依赖历史素材 | 引用原文，减少幻觉 |
| **⑥ 粘贴/拖拽** | 链接、聊天记录、图片 | 客服、带货 | 预处理（OCR/摘 URL）填入 slots |
| **⑦ 继承上下文** | 零输入部分字段 | 老用户 | 默认人设、上次风格、品牌语气摘要 |
| **⑧ 模板句填空** | 只填 `{商品}` `{条数}` | 固定句式运营 | 模板即 prompt 骨架 |

**推荐默认组合（非技术用户）：** ① 芯片 + ④ 最多 2 个必填 + ② 或 ③ 二选一 + ⑦ 继承人设。

### 7.3 InputProfile 配置（可独立文件，场景引用）

```json
{
  "id": "xhs-minimal",
  "capture": ["chips", "singleLineExtract", "inheritPersona"],
  "fields": [
    { "key": "topic", "label": "选题或链接", "required": true },
    { "key": "count", "type": "number", "default": 3, "chips": [1, 3, 5] },
    { "key": "tone", "type": "enum", "options": ["口语", "专业", "治愈"], "chip": true }
  ],
  "slotFilling": {
    "enabled": true,
    "maxTurns": 3,
    "onlyAskRequired": true
  },
  "promptTemplate": "你是小红书运营助手。\n人设：{{persona}}\n参考记忆：\n{{retrievedMemories}}\n任务：围绕「{{topic}}」生成 {{count}} 条{{tone}}风格笔记，输出 JSON。\n用户补充：{{extra}}"
}
```

- `promptTemplate`：编译层用，**不**直接展示给用户（设置里可「预览编译结果」）。  
- `fields`：驱动表单 / 芯片 / 抽槽目标 schema。  
- 场景通过 `inputProfileId` 引用；多个场景可共用同一 InputProfile。

### 7.4 怎样做到「字最少、prompt 最准」

1. **槽位少而硬**：必填 ≤2；其余用 default / chips / inherit。  
2. **枚举用点选不用写**：风格、条数、平台用 chips，避免自由发挥。  
3. **能选就不写**：记忆用勾选条目；人设从画像自动注入 `{{persona}}`。  
4. **一句化入口 + 机器抽槽**：单输入框背后 `extractSlots(userText, fields)`，缺槽再对话补问。  
5. **编译而非拼接**：统一 `compilePrompt(profile, slots, skill, memories)`，避免前端随手拼字符串。  
6. **运行前缺槽检查**：不齐则只追问缺的，不整段重问。  
7. **保存上次输入**：同场景二次打开预填，减少重复打字。

### 7.5 「输入标准化」管理界面做什么

路由建议：**场景 → 某场景 → 输入模板**，或全局 **输入模板库**（`InputProfile` 列表）。

| 功能 | 说明 |
|------|------|
| 字段列表 | 增删改 `fields`、必填、默认值、芯片选项 |
| 采集方式 | 勾选 capture 策略（芯片 / 单句抽槽 / 对话填槽） |
| 预览编译 | 用示例 slots 显示将发给模型的 user 消息（脱敏） |
| 试跑 | 用测试输入跑一遍抽槽 + 编译，不调用完整生成 |
| 与场景关系 | 显示哪些 Playbook 引用此模板 |

对话创建场景时，Designer Agent **生成/修改的主要是 InputProfile + 关联**，用户在预览页改字段即可。

---

## 8. 界面矩阵（需要哪些页）

| 页面 | 职责 | 优先级 |
|------|------|--------|
| **工作台 / 场景卡片** | 运行预置与用户场景 | P0 |
| **场景详情（运行页）** | 按 InputProfile 渲染采集 UI → 执行 Playbook | P0 |
| **场景列表与编辑** | 启用/禁用、复制、删除；跳转各子配置 | P1 |
| **对话创建场景** | Playbook Designer 向导 | P1 |
| **Skill 管理** | 导入、启用、编辑 SKILL.md | P0（已有） |
| **记忆 / 知识库** | 分类、标签、向量检索源数据 | P0（已有） |
| **输入模板管理** | InputProfile CRUD + 编译预览 | P1 |
| **设置 · LLM Provider** | Base URL、模型、探测 Ollama | P0 |

运行页与配置页分离：**运营每天只进运行页**；创建/改场景进 Designer 或编辑页。

---

## 9. 用户自建场景（补充：与 §6 对齐）

### 与 Skill 自建的关系

| 用户目标 | 路径 |
|----------|------|
| 改语气、改格式 | 编辑 / 导入 **Skill** |
| 改检索范围、记哪些库 | **记忆管理** 打标签/分类 |
| 改「要问用户什么、怎么编译 prompt」 | **输入模板**（InputProfile） |
| 改任务类型、组合上述三者 | **场景**（Playbook）或 **对话创建** |
| 两者都要 | Playbook 引用 `skillIds` + `inputProfileId` + `memoryScope` |

---

## 10. `playbook.json` 最小草案（实现参考）

```json
{
  "id": "xhs-content",
  "version": 1,
  "name": "小红书内容包",
  "description": "根据选题或商品链接生成可发布文案",
  "icon": "pen-line",
  "builtin": true,
  "inputProfileId": "xhs-minimal",
  "memoryScope": {
    "categories": ["xhs", "knowledge"],
    "tags": [],
    "topK": 5,
    "allowExpandSearch": true
  },
  "skillIds": ["xhs-copy"],
  "defaultSkillId": "xhs-copy",
  "steps": ["retrieve", "skill", "llm", "validate:banned-words", "persist:draft"],
  "outputSchema": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "body": { "type": "string" },
      "tags": { "type": "array", "items": { "type": "string" } }
    }
  },
  "persist": { "target": "drafts" },
  "export": { "template": "xhs-publish-block" }
}
```

实现时由 Zod 校验；`steps` 与注册表中的 step handler 对应，新增步骤只加 handler + 配置，不改 Runner 主干。

---

## 11. 编排器（PlaybookRunner）职责

单一入口，例如：

```ts
runPlaybook(playbookId: string, input: Record<string, unknown>): Promise<PlaybookResult>
```

内部：

1. 加载 `playbook.json`（builtin 优先，再 user 覆盖同名 id）  
2. 加载 `InputProfile`，采集/规范化 `slots`（表单、抽槽或对话填槽结果）  
3. `compilePrompt(profile, slots, skill, memories)` 得到 messages  
4. 按 `steps` 顺序执行  
5. 返回符合 `outputSchema` 的结果 + trace  

**LLM Provider** 从 `runtime_settings` 读取，不写入 playbook；场景只消费统一 `chat/completions` 接口。

---

## 12. 与现有代码的映射

| 已有 | 演进 |
|------|------|
| `ContentAgentInput` / `ContentAgentOutput`（`workspace.ts`） | 收敛为某 playbook 的 input/output 实例 |
| `skills/` + `storage/skills.ts` | Skill 存储；Playbook 通过 id 引用 |
| `listSkills()` stub | 接通后再做 Playbook 的 Skill 白名单校验 |
| `/` 万能聊天 | 降为次要入口或收进「高级对话」 |
| 主进程必启 Ollama | 改为 Provider；默认 `detectOllama()`，失败再引导设置 |
| 产品文档「创作中心」 | 对应 playbook `xhs-content` 的首屏 |

---

## 13. 产品原则（场景相关）

1. **首屏是任务，不是 Skill 管理。** Skill / 记忆 / 输入模板是后台资源，运行页极简。  
2. **自由组合：** 场景内 Skill 多选、记忆范围可配；先验可扩搜，非写死单 Skill。  
3. **创建场景用对话，保存前结构化确认。**  
4. **用户输入走 InputProfile + 编译层，** 不散落拼 prompt。  
5. **官方场景保证演示路径；** 一次提交 = 一次可追踪任务。  

---

## 14. 开放问题（实现前需拍板）

- [ ] 用户场景 id 冲突：user 覆盖 builtin 同名是否允许？建议：**禁止覆盖 id**，副本用新 id。  
- [ ] 场景是否必须绑定至少一个 Skill？建议：**是**。  
- [ ] InputProfile 是否独立表/目录？建议：**是**，`playbooks/input-profiles/{id}.json`，Playbook 引用。  
- [ ] 单句抽槽用本地小模型还是主模型？建议：主模型 + 短 schema JSON，失败再对话填槽。  
- [ ] 自由对话：内置 `free-chat` Playbook，无 InputProfile 或最简 profile。  
- [ ] 计费单位按场景 `meter` 还是全局统一？  

---

## 15. 一句话总结

**场景 = InputProfile + MemoryScope + SkillSet + 产物契约，共用一条 PlaybookRunner；Skill / 记忆 / 输入模板分表管理、自由组合。用户用对话创建场景，用芯片+极简字段+抽槽/填槽做到少打字，由编译层生成精准 prompt。**
