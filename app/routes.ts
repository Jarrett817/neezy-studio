import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  route("chat", "routes/chat.tsx"),
  route("creator", "routes/creator.tsx"),
  route("knowledge-base", "routes/knowledge-base.tsx"),
  route("skills", "routes/skills.tsx"),
  route("import", "routes/import.tsx"),
  route("analytics", "routes/analytics.tsx"),
  route("settings", "routes/settings.tsx"),
] satisfies RouteConfig
