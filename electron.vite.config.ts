import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import react from "@react-router/dev/vite"
import path from "path"

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist-electron",
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "src/main/index.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist-electron",
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "src/preload/index.ts"),
        },
      },
    },
  },
  renderer: {},
})
