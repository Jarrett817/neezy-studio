import { resolve } from "node:path"
import { defineConfig } from "electron-vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import svgr from "vite-plugin-svgr"

/**
 * 骨架对齐官方 react-ts（main/preload/renderer 三分 + out/ + loadURL/loadFile）。
 */

/** 须保持为 node_modules 实体路径：pi-coding-agent 的 jiti loader 用 import.meta.url 推算别名 */
const MAIN_NATIVE_EXTERNALS = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "typebox",
  "pi-web-access",
  "pi-permission-system",
  "pi-mcp-adapter",
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
      },
    },
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset({ target: "19" })] }),
      tailwindcss(),
      svgr({ include: "**/*.svg?react" }),
    ],
    optimizeDeps: {
      holdUntilCrawlEnd: true,
    },
  },
})
