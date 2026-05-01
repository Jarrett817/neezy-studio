import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/chat.tsx"),
  route("creator", "routes/creator.tsx"),
  route("knowledge-base", "routes/knowledge-base.tsx"),
  route("skills", "routes/skills.tsx"),
  route("settings", "routes/settings.tsx"),
] satisfies RouteConfig
