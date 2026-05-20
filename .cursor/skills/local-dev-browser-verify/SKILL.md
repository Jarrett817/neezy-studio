---
name: local-dev-browser-verify
description: After implementing a frontend or web feature, navigates to the local development server URL and performs browser-based verification. Use when the user has completed a feature and wants verification, when they ask to validate in the browser, to 校验/验证 功能, or when they mention local dev check or 自行访问本地开发服务.
---

# 本地开发服务浏览器校验

在完成前端/Web 功能开发后，**自行访问本地开发服务地址**，通过浏览器操作进行功能校验并汇报结果。

## 何时执行

- 用户明确要求「写完功能后帮忙在浏览器里验证一下」或类似表述
- 完成与页面、路由、表单、UI 交互相关的功能开发后，用户希望做一次校验
- 用户提到「本地验证」「开发环境验证」「浏览器里点一点」等

## 工作流

按顺序执行，不跳步：

1. **确定本地开发地址**
   - 优先从项目配置推断：`package.json` 的 `scripts.dev` / `scripts.start`（如 `next dev`、`vite`、`npm run dev`）对应端口；或 `.env` / `.env.local` 中的 `PORT`、`BROWSER_URL` 等。
   - Next.js 默认：`http://localhost:3000`
   - Vite 默认：`http://localhost:5173`
   - 若无法推断，使用 `http://localhost:3000` 并说明假设。

2. **确认开发服务已运行**
   - 若未启动：先执行启动命令（如 `npm run dev` / `pnpm dev`），等待几秒再访问。
   - 若已启动：直接进入下一步。

3. **用浏览器访问并校验**
   - 使用 MCP 浏览器能力：`browser_navigate` 打开上述地址。
   - 使用 `browser_snapshot` 获取当前页结构，确认页面加载正常、无报错。
   - 根据**本次实现的功能**做最小必要操作验证，例如：
     - 新页面/新路由：导航到对应路径，确认内容与预期一致。
     - 新按钮/链接：点击后确认跳转或状态变化。
     - 表单：填写关键字段并提交（或点到提交前一步），确认无控制台报错、无白屏。
   - 校验范围以「刚改动的功能」为主，不必做全站回归。

4. **汇报结果**
   - 简要说明：访问的 URL、执行了哪些操作、是否通过。
   - 若发现控制台错误、白屏、或与预期不符，直接指出并建议修复方向。

## 使用浏览器工具时的注意点

- **先 snapshot 再操作**：在点击、输入前先 `browser_snapshot`，用返回的 ref 进行 `browser_click`、`browser_type`、`browser_fill` 等，避免盲目操作。
- **等待加载**：导航或提交后若需等待接口/渲染，用 `browser_wait_for`（如 2–3 秒）再 snapshot 或下一步操作。
- **锁与解锁**：若需连续多步操作，按 MCP 说明在适当时机使用 `browser_lock` / `browser_unlock`，避免与用户操作冲突。

## 校验报告模板

完成后可按下面格式简要汇报：

```markdown
## 本地浏览器校验结果

- **访问地址**: [URL]
- **执行操作**: [例如：打开首页 → 点击「登录」→ 输入框可见]
- **结果**: ✅ 通过 / ❌ 未通过
- **备注**: [控制台错误、样式问题、或其它需要修复的点]
```

## 不做的事

- 不代替用户做完整 E2E 测试或全量回归，只针对「本次实现的功能」做最小验证。
- 若项目无本地前端（纯后端/脚本），或用户未要求浏览器验证，不强制打开浏览器。
