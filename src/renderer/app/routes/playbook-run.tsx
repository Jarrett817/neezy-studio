import { Navigate, useParams } from "react-router"

import { SCENE_CHAT_LAUNCH_STATE, sceneChatPath } from "~/lib/scene-chat-nav"

/** @deprecated 场景运行统一走 /chat?playbook= */
export default function PlaybookRunRoute() {
  const { playbookId = "" } = useParams()
  if (!playbookId) return <Navigate to="/scenes" replace />
  return (
    <Navigate
      to={sceneChatPath(playbookId)}
      state={SCENE_CHAT_LAUNCH_STATE}
      replace
    />
  )
}
