import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  build: {
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      external: ["react", "react-dom", "react-router"],
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules/@tanstack/react-query")) return "query"
          if (id.includes("lucide-react") || id.includes("class-variance-authority") || id.includes("clsx") || id.includes("tailwind-merge")) return "ui"
        },
      },
    },
  },
})