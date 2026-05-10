import { defineConfig } from "drizzle-kit"
import path from "path"

// 开发环境使用相对路径（与生产共用 appDataDir 策略，仅用于 drizzle-kit CLI）
// 生产环境由 tauri-plugin-sql 通过 appDataDir 管理路径
const DB_PATH = process.env.DATABASE_URL || path.join(process.cwd(), "drizzle", "neezy-memory.db")

export default defineConfig({
  schema: "./app/services/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: DB_PATH,
  },
})
