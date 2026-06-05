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
import { StudioLayout } from "~/components/shell/studio-layout"
import { Toaster } from "~/components/ui/sonner"
import { queryClient } from "~/lib/query-client"
import ChatRoute from "~/routes/chat"
import ConnectRoute from "~/routes/connect"
import CreateRoute from "~/routes/create"
import KnowledgeRoute from "~/routes/knowledge"
import PlaybookDesignerRoute from "~/routes/playbook-designer"
import PlaybookRunRoute from "~/routes/playbook-run"
import SceneDetailRoute from "~/routes/scene-detail"
import SettingsRoute from "~/routes/settings"
import SkillsRoute from "~/routes/skills"
import StudioIndexRoute from "~/routes/studio/index"
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
              <Route path="create" element={<CreateRoute />} />
              <Route path="create/:playbookId" element={<PlaybookRunRoute />} />
              <Route path="scenes/:playbookId" element={<SceneDetailRoute />} />
              <Route path="drafts" element={<Navigate to="/chat" replace />} />
              <Route path="knowledge" element={<KnowledgeRoute />} />
              <Route path="chat" element={<ChatRoute />} />
              <Route path="connect" element={<ConnectRoute />} />
              <Route path="settings" element={<SettingsRoute />} />
              <Route path="skills" element={<SkillsRoute />} />

              <Route path="studio" element={<StudioLayout />}>
                <Route index element={<StudioIndexRoute />} />
                <Route
                  path="playbook-designer"
                  element={<PlaybookDesignerRoute />}
                />
              </Route>

              <Route
                path="playbooks"
                element={<Navigate to="/create" replace />}
              />
              <Route
                path="playbooks/designer"
                element={<Navigate to="/studio/playbook-designer" replace />}
              />
              <Route
                path="playbooks/:playbookId"
                element={<PlaybookIdRedirect />}
              />

              <Route
                path="knowledge-base"
                element={<Navigate to="/knowledge" replace />}
              />
              <Route
                path="portrait"
                element={<Navigate to="/knowledge?tab=persona" replace />}
              />
              <Route
                path="studio/skills"
                element={<Navigate to="/skills" replace />}
              />
              <Route
                path="input-profiles"
                element={<Navigate to="/studio/playbook-designer" replace />}
              />
              <Route
                path="input-profiles/:profileId"
                element={<Navigate to="/studio/playbook-designer" replace />}
              />
              <Route
                path="studio/input-profiles"
                element={<Navigate to="/studio/playbook-designer" replace />}
              />
              <Route
                path="studio/input-profiles/:profileId"
                element={<Navigate to="/studio/playbook-designer" replace />}
              />

              <Route path="models" element={<Navigate to="/connect" replace />} />
              <Route
                path="connect/local-models"
                element={<Navigate to="/connect" replace />}
              />
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
