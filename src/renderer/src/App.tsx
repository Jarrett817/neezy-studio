import { Component, Suspense, lazy, type ReactNode } from "react"
import {
  HashRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router"
import { QueryClientProvider } from "@tanstack/react-query"

import { AppShell } from "~/components/app-shell"
import { queryClient } from "~/lib/query-client"

const ChatRoute = lazy(() => import("~/routes/chat"))
const ConnectRoute = lazy(() => import("~/routes/connect"))
const SettingsRoute = lazy(() => import("~/routes/settings"))
const SkillsRoute = lazy(() => import("~/routes/skills"))
const Toaster = lazy(() =>
  import("~/components/ui/sonner").then((m) => ({ default: m.Toaster }))
)

function RouteFallback() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted-foreground">
      加载中…
    </div>
  )
}

function ShellLayout() {
  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    </AppShell>
  )
}

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
        <HashRouter>
          <Routes>
            <Route element={<ShellLayout />}>
              <Route index element={<Navigate to="/chat" replace />} />
              <Route path="chat" element={<ChatRoute />} />
              <Route path="skills" element={<SkillsRoute />} />
              <Route path="connect" element={<ConnectRoute />} />
              <Route path="settings" element={<SettingsRoute />} />
              <Route path="*" element={<Navigate to="/chat" replace />} />
            </Route>
          </Routes>
        </HashRouter>
        <Suspense fallback={null}>
          <Toaster position="top-center" />
        </Suspense>
      </AppErrorBoundary>
    </QueryClientProvider>
  )
}
