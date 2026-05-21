import { FadeIn } from "~/components/animation-effects"
import { PortraitLivingOrganism } from "~/components/portrait/portrait-living-organism"
import type { UserPortrait } from "~/services/user-portrait"

export function UserPortraitPanel({ portrait }: { portrait: UserPortrait }) {
  return (
    <div className="space-y-4">
      <FadeIn>
        <PortraitLivingOrganism portrait={portrait} />
      </FadeIn>
    </div>
  )
}
