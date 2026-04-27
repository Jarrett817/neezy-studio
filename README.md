# Neezy Studio

Neezy Studio 的桌面端模型调用走的是 `Tauri sidecar + Bun + node-llama-cpp`。

## 侧车结构

- `sidecar-app/index.ts` 是唯一 sidecar 入口。
- `sidecar-app/package.json` 单独管理 `node-llama-cpp` 依赖。
- Rust 侧通过 `tauri_plugin_shell` 调用 `sidecar("bun")`，把 `index.ts` 路径和 payload 文件路径作为参数传给 Bun。
- `src-tauri/tauri.conf.json` 通过 `bundle.externalBin` 打包 `src-tauri/binaries/bun-<target-triple>(.exe)`，并把 `sidecar-app` 资源一起带进应用包。

Tauri 官方 Node.js sidecar 文档使用 `@yao-pkg/pkg` 打包 Node 入口。这里没有照搬 `pkg`，因为 `node-llama-cpp` 会加载平台相关原生绑定和可选 GPU 包，单文件打包很容易把动态依赖、`.node` 文件和运行期探测打坏。当前方案仍遵守 Tauri sidecar 的外部二进制命名规则，只是把 Bun 运行时作为 sidecar，由 Bun 去执行资源目录里的 agent 脚本。

## 构建方式

先安装依赖：

```bash
bun install
```

安装 sidecar 依赖：

```bash
cd sidecar-app
bun install
```

回到项目根目录后，构建 sidecar：

```bash
bun run build:sidecar
```

这个脚本会把当前机器上的 Bun 可执行文件按 Tauri 官方 sidecar 命名规则复制到：

- `src-tauri/binaries/bun-x86_64-pc-windows-msvc.exe`
- `src-tauri/binaries/bun-aarch64-apple-darwin`
- `src-tauri/binaries/bun-x86_64-unknown-linux-gnu`

开发和打包都会先自动执行 `build:sidecar`：

```bash
bunx tauri dev
bunx tauri build
```

## 运行要求

- 本地需要可用的 GGUF 模型文件路径。
- `node-llama-cpp` 由 Bun sidecar 直接加载，不走额外服务层。
- 设置页可以配置 Hugging Face Endpoint，国内默认用 `https://hf-mirror.com`。
- 设置页登记已下载模型后，Creator 页面会按 CPU、内存和负载自动选择模型。
- Agent 会串联 MemoryAgent、KnowledgeAgent、SkillAgent 和 ContentAgent，输出 JSON 草稿结果。
