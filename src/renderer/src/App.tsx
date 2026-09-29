import { QueryClientProvider } from "@tanstack/react-query"
import { Component, type ComponentType, type ReactNode } from "react"
import {
  createHashRouter,
  Navigate,
  Outlet,
  RouterProvider,
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

function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

const router = createHashRouter([
  {
    element: <ShellLayout />,
    children: [
      { index: true, element: <Navigate to="/chat" replace /> },
      { path: "chat", ...lazyPage(() => import("~/routes/chat")) },
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
