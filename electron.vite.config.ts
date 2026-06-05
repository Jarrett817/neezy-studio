import { resolve } from "node:path"
import { defineConfig } from "electron-vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import svgr from "vite-plugin-svgr"

/**
 * 骨架对齐官方 react-ts（main/preload/renderer 三分 + out/ + loadURL/loadFile）。
 */

/** 须保持为 node_modules 实体路径：pi-coding-agent 的 jiti loader 用 import.meta.url 推算别名 */
const MAIN_NATIVE_EXTERNALS = [
  "node-llama-cpp",
  /^@node-llama-cpp\//,
  "@libsql/client",
  /^@libsql\//,
  "libsql",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-tui",
  "typebox",
  "pi-web-access",
  "pi-textbrowser",
  "pi-chrome",
  "pi-permission-system",
  "pi-sandbox",
  "@carderne/sandbox-runtime",
  "playwright",
  "playwright-core",
  /^playwright\//,
  "tesseract.js",
] as const

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
