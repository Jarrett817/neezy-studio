import { QueryClientProvider } from "@tanstack/react-query"
import { Component, type ComponentType, type ReactNode, useRef } from "react"
import {
  createHashRouter,
  Navigate,
  RouterProvider,
  useLocation,
  useOutlet,
} from "react-router"

import { AppShell } from "~/components/app-shell"
import { Toaster } from "~/components/ui/sonner"
import { queryClient } from "~/lib/query-client"

function lazyPage(load: () => Promise<{ default: ComponentType }>) {
  return {
    lazy: async () => {
      const mod = await load()
      return { Component: mod.default }
    },
  }
}

/** 保活路由:切走时仅 display:none,组件不卸载,后台流式对话继续 */
const KEEP_ALIVE_PATHS = new Set(["/chat"])

function KeepAliveOutlet() {
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const cache = useRef<Map<string, ReactNode>>(new Map())

  if (KEEP_ALIVE_PATHS.has(pathname)) {
    cache.current.set(pathname, outlet)
  }

  return (
    <>
      {[...cache.current.entries()].map(([path, element]) => (
        <div key={path} className={path === pathname ? "h-full" : "hidden"}>
          {element}
        </div>
      ))}
      {KEEP_ALIVE_PATHS.has(pathname) ? null : outlet}
    </>
  )
}

function ShellLayout() {
  return (
    <AppShell>
      <KeepAliveOutlet />
    </AppShell>
  )
}

const router = createHashRouter([
  {
    element: <ShellLayout />,
    children: [
      { index: true, element: <Navigate to="/chat" replace /> },
      { path: "chat", ...lazyPage(() => import("~/routes/chat")) },
      { path: "tasks", ...lazyPage(() => import("~/routes/tasks")) },
      { path: "skills", ...lazyPage(() => import("~/routes/skills")) },
      { path: "mcp", ...lazyPage(() => import("~/routes/mcp")) },
      { path: "connect", ...lazyPage(() => import("~/routes/connect")) },
      { path: "settings", ...lazyPage(() => import("~/routes/settings")) },
      { path: "*", element: <Navigate to="/chat" replace /> },
    ],
  },
])

type ErrorBoundaryState = { error: Error | null }

class AppErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <main className="container mx-auto p-4 pt-16">
          <h1>出错啦</h1>
          <p className="text-sm text-muted-foreground">
            {this.state.error.message}
          </p>
        </main>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <RouterProvider
          router={router}
          fallbackElement={
            <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
              加载中…
            </div>
          }
        />
        <Toaster position="top-center" />
      </AppErrorBoundary>
    </QueryClientProvider>
  )
}
