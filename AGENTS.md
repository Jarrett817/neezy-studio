# 项目约定

## 包管理

- **只用 Bun**：`bun install` / `bun add` / `bunx`
- 禁止使用 `npm`、`npx`、`pnpm`、`yarn`

## 生成代码规范

- 尽可能精简、高效，keep it simple
- 禁止生成 example、test 等验证输出的代码文件
- 如果有组件使用示例，在组件文件里注释中写示例即可
- 用户问到 https://pixso.hikvision.com.cn 时，使用 Pixso MCP 工具获取，不是访问网页
- `<Button>` 不需要加 `type="button"`，HTML button 默认就是 `type="button"`；只在表单提交按钮上显式写 `type="submit"`
- 禁止 `==` 和 `!=`，必须用 `===` 和 `!==`
- 禁止无意义的懒加载（`await import()`）；只有明确需要代码分割的大组件、大第三方库、低频使用场景才用动态 import，一般模块直接顶部静态 import
- 多值相等判断禁止 `a === b || a === c`，用 `[b, c].includes(a)`
- 禁止无意义的中间变量（如 `const x = y; return x`），直接使用原始值
- 多值比较禁止 `a === b || a === c`，用 `[b, c].includes(a)`
- 如果涉及到拆分或者新编写的组件、代码，写完用biome格式化一下，已经存在的超过200行的代码都先不要格式化

## 技术栈

- React 19、TypeScript 5.9
- React Router 7、Vite 7
- Tailwind CSS 4、tailwind-merge、class-variance-authority、clsx
- Radix UI、shadcn（radix-nova style，`~/components/ui`）
- TanStack React Query、TanStack React Table、Zod
- Flowgram（`@flowgram.ai/core`、`free-layout-editor`、`free-stack-plugin`、`minimap-plugin`）
- dayjs、lodash-es、lucide-react、recharts、sonner
- svn 做版本管理，不是git

## 样式约束

- UI 与布局只用 Tailwind utility（含 `cn()`、CVA 等）
- 禁止新建 CSS / CSS Modules / 自定义选择器
- 禁止 `style={{ }}` 或 `<style>` 标签
- `styled-components` 不新增使用

## shadcn / 组件

- 只通过 shadcn CLI 添加组件：`bunx shadcn@latest add <component>`
- 禁止手写 shadcn 底层 primitive
- 业务组件通过组合 `~/components/ui/*` 实现
