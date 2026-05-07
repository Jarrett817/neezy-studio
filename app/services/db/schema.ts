// Drizzle schema for memories

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const memoryItems = sqliteTable("memory_items", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull().default("记忆"),
  content: text("content").notNull(),
  file_path: text("file_path").notNull(),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
})

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
  message_count: integer("message_count").default(0),
  last_message_preview: text("last_message_preview"),
})

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updated_at: integer("updated_at").notNull(),
})

export const memorySlices = sqliteTable("memory_slice_metadata", {
  id: text("id").primaryKey(),
  session_id: text("session_id"),
  memory_type: text("memory_type").notNull(),
  content_preview: text("content_preview").notNull(),
  created_at: integer("created_at").notNull(),
})
