import { Component, type ReactNode } from "react"
import {
  HashRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router"
import { QueryClientProvider } from "@tanstack/react-query"

import { AppShell } from "~/components/app-shell"
import { Toaster } from "~/components/ui/sonner"
import { queryClient } from "~/lib/query-client"
import ChatRoute from "~/routes/chat"
import ConnectRoute from "~/routes/connect"
import SettingsRoute from "~/routes/settings"
import SkillsRoute from "~/routes/skills"

function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
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
        <Toaster position="top-center" />
      </AppErrorBoundary>
    </QueryClientProvider>
  )
}
