import { Navigate, useParams } from "react-router"

/** @deprecated 场景运行统一走 /chat?playbook= */
export default function PlaybookRunRoute() {
  const { playbookId = "" } = useParams()
  if (!playbookId) return <Navigate to="/scenes" replace />
  return (
    <Navigate
      to={`/chat?playbook=${encodeURIComponent(playbookId)}`}
      replace
    />
  )
}
