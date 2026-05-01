---
name: concise-coding
description: Concise responses, prefer CLI tools and mature solutions
type: feedback
---

## 回答原则
- 一句话说清结论，再解释原因
- 代码实现只给关键改动，不给完整模板
- 能用工具完成的就不要手写代码

## 实现原则
- 优先用 CLI 工具（如 `cargo add`、`npm exec`、`npx`）
- 安装依赖用 CLI，不用手写配置
- 选用成熟方案（主流库/框架内置功能），不重复造轮子
- 小的改动直接给 diff，不解释做什么（代码即文档）

## 禁止
- 长篇解释 "做了什么"
- 生成完整文件除非绝对必要
- 手写安装脚本或配置（能用 CLI 就用 CLI）
- 推荐未经广泛验证的库或轮子
