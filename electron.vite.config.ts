import { resolve } from "node:path"
import { defineConfig } from "electron-vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import svgr from "vite-plugin-svgr"
import type { Plugin } from "vite"

/**
 * 骨架对齐官方 react-ts（main/preload/renderer 三分 + out/ + loadURL/loadFile）。
 * 官方模板： https://github.com/alex8088/quick-start/tree/master/packages/create-electron/template/react-ts
 *
 * 与官方的必要差异（空模板没有）：
 * - main：打包 ollama / pi-agent（ev6 需 noExternal 插件，ev5 无法等价打包这些 ESM 依赖）
 * - preload：package.json 为 type:module 时须输出 .cjs
 * - renderer：tailwind、svgr、~ 别名、holdUntilCrawlEnd（依赖多，防 ERR_ABORTED）
 */

const BUNDLE_MAIN_DEPS = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "typebox",
  "ollama",
  "ai",
  "@ai-sdk/openai",
  "@ai-sdk/provider",
] as const

/** 含平台可选依赖，禁止打进 main bundle */
const MAIN_NATIVE_EXTERNALS = [
  "node-llama-cpp",
  /^@node-llama-cpp\//,
  "@libsql/client",
  /^@libsql\//,
  "libsql",
  /** jiti 运行时从 node_modules 加载 extension 源码 */
  "pi-web-access",
] as const

function mainProcessBundlePlugin(): Plugin {
  return {
    name: "neezy:main-bundle-policy",
    enforce: "post",
    configResolved(config) {
      config.ssr.noExternal = [...BUNDLE_MAIN_DEPS]
    },
  }
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: [...MAIN_NATIVE_EXTERNALS],
      },
      rolldownOptions: {
        external: [...MAIN_NATIVE_EXTERNALS],
      },
    },
    plugins: [mainProcessBundlePlugin()],
  },
  preload: {
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "~": resolve("src/renderer/app"),
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [react(), tailwindcss(), svgr({ include: "**/*.svg?react" })],
    optimizeDeps: {
      holdUntilCrawlEnd: true,
    },
  },
})
