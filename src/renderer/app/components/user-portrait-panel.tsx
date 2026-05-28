import { PortraitDocumentPanel } from "~/components/portrait/portrait-document-panel"
import type { UserPortrait } from "~/services/user-portrait"

export function UserPortraitPanel({ portrait }: { portrait: UserPortrait }) {
  return <PortraitDocumentPanel portrait={portrait} />
}
