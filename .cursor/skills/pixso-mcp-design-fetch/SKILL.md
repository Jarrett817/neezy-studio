---
name: pixso-mcp-design-fetch
description: >-
  When the user sends a Pixso link (pixso.net / pixso.cn / app URL with item-id),
  fetches design evidence via Pixso MCP (getCode, getImage) before implementing UI.
  Use when messages contain Pixso URLs, item-id=, 设计稿, 按稿, 还原样式, or Hikvision Pixso file links.
  Complements design-mockup-pencil-mcp (Pencil); Pixso links always go through this skill’s MCP flow first.
---

# Pixso 链接 → Pixso MCP 取证

## 默认行为

用户消息里出现 **Pixso 链接**（含 `item-id=` 的稿面 URL，或明确指向 Pixso 的稿源）时，**默认视为要求用 Pixso MCP 拉稿**：不要凭记忆猜宽高与色值；在改 UI 或写新样式前 **先 MCP 取证，再写代码**。

## 触发词（非穷尽）

Pixso URL、`item-id=`、`设计稿`、`按稿`、`还原样式`、以及稿面分享里常见的 file / node 上下文。

## 工作流（MCP 可用时）

1. **读工具 schema**：在调用 MCP 前，读取 Pixso 服务器下 `getCode`、`getImage` 的 JSON 描述（参数名以 schema 为准）。
2. **解析 `itemId`**：从 URL 的 query（如 `item-id=5:33792`）或用户粘贴的节点 id 得到 `itemId`；本仓库为 React，调用时 `clientFrameworks` 传 **`react`**（若 schema 有该字段）。
3. **依次调用**：对同一目标节点调用 **`getCode`**、**`getImage`**，拿到结构与视觉依据。
4. **摘录核对清单**（可进 PR 说明或极简行内注释，例如 `// Pixso 5:33792: …`）：外边距/内边距、圆角层级、背景/边框/文字色值、字号字重行高、控件固定宽高（px）、图标尺寸与资源。
5. **与代码 diff**：缺 MCP/稿面证据的数值 **不编造**；不得用「差不多」替代稿面数字。

## 仓库 SVG

若用户或仓库已提供 **具名 SVG**（如 `search-simple.svg`），**禁止**用 lucide 等通用图标顶替稿面资源；应 `import X from "~/assets/icons/....svg?react"`（路径以仓库为准）。

## MCP 不可用或 getCode 无有效样式时

在回复中标明 **证据缺口**；仅实现用户 **逐条写出** 的尺寸与颜色，不补全未给出的稿面细节。

## 与 Pencil 的分工

稿在 **Pencil** 时跟 **`design-mockup-pencil-mcp`**；**Pixso 链接**一律走本 skill 的 Pixso MCP 流程。

## 改 UI 前自检（择要）

- [ ] 关键控件宽高（px）与稿或 MCP 导出一致  
- [ ] 圆角分层（弹层 / 输入 / 按钮）与稿一致  
- [ ] 色值与产品其他屏一致（若有约定）  
- [ ] 图标为指定 SVG 且位置与稿一致  
