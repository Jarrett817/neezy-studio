---
name: design-mockup-pencil-mcp
description: Fetches design mockups via Pencil MCP, performs precise style comparison with implementation, and restores UI to match the design. Use when design is provided through Pencil MCP, when the user asks to 还原设计/按设计稿实现/精准比对样式, or when implementing UI from design specs.
---

# 设计稿还原（Pencil MCP）

设计稿通过 **Pencil MCP** 提供。优先调用 Pencil MCP 服务获取设计稿数据，进行样式精准比对，并按设计稿还原前端实现。

## 何时执行

- 用户说明设计稿通过 Pencil MCP 提供，或要求「按设计稿实现」「还原设计」
- 用户要求「精准比对样式」「和设计稿一致」「对照设计稿改」
- 实现或调整页面/组件时，需要参考 Pencil MCP 中的设计资源

## 工作流

1. **获取设计稿**
   - 调用 Pencil MCP 提供的工具（如列出设计资源、获取指定设计/画布/节点等），拿到当前任务相关的设计稿数据。
   - 若用户已指明具体设计/页面/画布，优先获取该目标；否则先列出可用设计再选取。

2. **提取设计规范**
   - 从设计稿中提取：布局（栅格、间距、对齐）、颜色（色值、语义）、字体（字号、字重、行高）、圆角、阴影、边框等。
   - 记录关键数值（px/rem、色值、字体名），便于与代码一一对应。

3. **样式精准比对**
   - 对照当前代码（CSS/组件/设计系统变量）与设计稿：
     - 逐块比对：容器宽高、padding/margin、gap、flex/grid 参数。
     - 字体：font-size、font-weight、line-height、font-family 是否一致。
     - 颜色：背景、文字、边框、图标色是否与设计稿色值一致。
     - 圆角、阴影、边框等装饰属性是否一致。
   - 列出差异项（组件/选择器 + 属性 + 设计值 vs 当前值），作为修改清单。

4. **按设计还原实现**
   - 按差异清单修改样式：优先使用现有设计 token/变量；若无则用设计稿中的具体值，并考虑是否抽成 token。
   - 保持结构简洁：不为了「像素级」引入过多嵌套或冗余 class；若偏差在 1–2px 且视觉可接受，可注明后从简。
   - 还原后若有浏览器校验需求，可结合本地开发校验流程做一次视觉确认。

5. **简要汇报**
   - 说明已获取的设计来源（如画布/页面名）、做了哪些样式比对与修改、是否还有已知偏差及原因。

## 使用 Pencil MCP 的注意点

- **MCP 名称**：Pencil 的 MCP 工具命名为 **`pencil`**，调用时使用 server 名称 `pencil`（若当前环境显示为 `user-pencil` 等，以实际可用 server 名为准）。
- **先查后做**：在改代码前先通过 Pencil MCP 拿到最新设计数据，避免凭记忆或过时截图修改。
- **工具名以实际为准**：若 MCP 暴露的工具名与本文不同（如 `list_designs`、`get_canvas`、`get_node_styles` 等），以当前环境的 Pencil MCP 文档或工具列表为准，本流程中的「列出/获取设计」等步骤对应调用即可。
- **无 Pencil MCP 时**：若环境中未配置或无法调用 Pencil MCP，明确告知用户需要 Pencil MCP 才能做设计稿拉取与精准比对，并仅能基于用户贴图或描述做近似还原。

## 比对与还原原则

- **一致性优先**：同一设计系统中的颜色、字号、间距尽量用同一套 token/变量，避免硬编码重复。
- **可维护性**：还原时保持 class 命名与结构清晰，便于后续迭代。
- **偏差说明**：因适配（如响应式、行内文本折行）导致的合理偏差，在汇报中简要说明即可。
