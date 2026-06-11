import { Component, type ReactNode } from "react"
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useParams,
} from "react-router"
import { QueryClientProvider } from "@tanstack/react-query"

import { AppShell } from "~/components/app-shell"
import { Toaster } from "~/components/ui/sonner"
import { queryClient } from "~/lib/query-client"
import ChatRoute from "~/routes/chat"
import ConnectRoute from "~/routes/connect"
import KnowledgeRoute from "~/routes/knowledge"
import PlaybookDesignerRoute from "~/routes/playbook-designer"
import PlaybookRunRoute from "~/routes/playbook-run"
import PortraitRoute from "~/routes/portrait"
import SceneDetailRoute from "~/routes/scene-detail"
import SceneListRoute from "~/routes/scenes"
import SceneRunRoute from "~/routes/scene-run"
import SettingsRoute from "~/routes/settings"
import SkillsRoute from "~/routes/skills"
import WorkbenchRoute from "~/routes/workbench"

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
        <BrowserRouter>
          <Routes>
            <Route element={<ShellLayout />}>
              <Route index element={<WorkbenchRoute />} />
              <Route path="chat" element={<ChatRoute />} />
              <Route path="scenes" element={<SceneListRoute />} />
              <Route path="scenes/designer" element={<PlaybookDesignerRoute />} />
              <Route path="scenes/:playbookId" element={<SceneRunRoute />} />
              <Route path="scenes/:playbookId/detail" element={<SceneDetailRoute />} />
              <Route path="knowledge" element={<KnowledgeRoute />} />
              <Route path="skills" element={<SkillsRoute />} />
              <Route path="portrait" element={<PortraitRoute />} />
              <Route path="connect" element={<ConnectRoute />} />
              <Route path="settings" element={<SettingsRoute />} />
              <Route path="create/:playbookId" element={<PlaybookRunRoute />} />

              {/* Redirects from old routes */}
              <Route path="create" element={<Navigate to="/scenes" replace />} />
              <Route path="studio" element={<Navigate to="/scenes" replace />} />
              <Route path="studio/playbook-designer" element={<Navigate to="/scenes/designer" replace />} />
              <Route path="playbooks" element={<Navigate to="/scenes" replace />} />
              <Route path="playbooks/designer" element={<Navigate to="/scenes/designer" replace />} />
              <Route path="playbooks/:playbookId" element={<PlaybookIdRedirect />} />
              <Route path="knowledge-base" element={<Navigate to="/knowledge" replace />} />
              <Route path="drafts" element={<Navigate to="/chat" replace />} />
              <Route path="models" element={<Navigate to="/connect" replace />} />
              <Route path="connect/local-models" element={<Navigate to="/connect" replace />} />
              <Route path="input-profiles" element={<Navigate to="/scenes/designer" replace />} />
              <Route path="input-profiles/:profileId" element={<Navigate to="/scenes/designer" replace />} />
              <Route path="studio/input-profiles" element={<Navigate to="/scenes/designer" replace />} />
              <Route path="studio/input-profiles/:profileId" element={<Navigate to="/scenes/designer" replace />} />
              <Route path="studio/skills" element={<Navigate to="/skills" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" />
      </AppErrorBoundary>
    </QueryClientProvider>
  )
}

function PlaybookIdRedirect() {
  const { playbookId = "" } = useParams()
  return <Navigate to={`/scenes/${playbookId}`} replace />
}
