import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import svgr from "vite-plugin-svgr"

export default defineConfig({
  // reactRouter 需在 svgr 之前，避免 virtual:react-router/server-build 解析异常
  plugins: [tailwindcss(), reactRouter(), svgr({ include: "**/*.svg?react" })],
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: {
    include: ["three", "@react-three/fiber", "@react-three/drei"],
  },
  build: {
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules/@tanstack/react-query")) return "query"
          if (id.includes("node_modules/three")) return "three"
          if (id.includes("@react-three")) return "r3f"
          if (
            id.includes("lucide-react") ||
            id.includes("class-variance-authority") ||
            id.includes("clsx") ||
            id.includes("tailwind-merge")
          )
            return "ui"
        },
      },
    },
  },
})
