import { useMemo, useState } from "react"
import { motion } from "framer-motion"

import {
  branchOpacity,
  branchVisible,
  hsl,
  type PortraitVisualProfile,
} from "~/lib/portrait-visual"
import type { PortraitDimension } from "~/services/user-portrait"
import { cn } from "~/lib/utils"

export function PortraitMemoryVines({
  dimensions,
  profile,
  size = 420,
  className,
}: {
  dimensions: PortraitDimension[]
  profile: PortraitVisualProfile
  size?: number
  className?: string
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [tip, setTip] = useState<{
    x: number
    y: number
    dim: PortraitDimension
  } | null>(null)

  const cx = size / 2
  const cy = size / 2
  const maxLen = size * 0.44 * (0.55 + profile.maturity * 0.5)

  const branches = useMemo(() => {
    const n = dimensions.length || 1
    return dimensions.map((dim, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2
      const len = maxLen * (0.12 + (dim.score / 100) * 0.88)
      const ex = cx + Math.cos(angle) * len
      const ey = cy + Math.sin(angle) * len
      const cpx = cx + Math.cos(angle) * len * 0.45 + Math.sin(angle) * 12
      const cpy = cy + Math.sin(angle) * len * 0.45 - Math.cos(angle) * 12
      const d = `M ${cx} ${cy} Q ${cpx} ${cpy} ${ex} ${ey}`
      const hidden = dim.score < 28
      return { dim, d, ex, ey, angle, len, hidden }
    })
  }, [dimensions, cx, cy, maxLen])

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full",
        className
      )}
      aria-hidden
    >
      <defs>
        <linearGradient id="vine-flow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={hsl(profile, 0.15)} />
          <stop offset="50%" stopColor={hsl(profile, 0.75)} />
          <stop offset="100%" stopColor={hsl(profile, 0.2)} />
        </linearGradient>
      </defs>
      {branches.map(({ dim, d, ex, ey, hidden }) => {
        const hovered = hoveredId === dim.id
        const show = branchVisible(dim.score, hovered)
        if (!show && !hidden) return null
        const opacity = branchOpacity(dim.score, hovered)
        return (
          <g
            key={dim.id}
            className="pointer-events-auto cursor-pointer"
            onMouseEnter={() => {
              setHoveredId(dim.id)
              setTip({ x: ex, y: ey, dim })
            }}
            onMouseLeave={() => {
              setHoveredId(null)
              setTip(null)
            }}
          >
            <motion.path
              d={d}
              fill="none"
              stroke="url(#vine-flow)"
              strokeWidth={
                hovered ? 2.8 : hidden ? 1 : 1.4 + (dim.score / 100) * 1.2
              }
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: dim.score > 0 ? 1 : 0.15,
                opacity,
              }}
              transition={{
                pathLength: {
                  duration: 1.8 + (1 - dim.score / 100) * 0.8,
                  ease: "easeOut",
                },
                opacity: { duration: 0.35 },
              }}
              style={{
                filter: hovered
                  ? `drop-shadow(0 0 8px ${hsl(profile, 0.6)})`
                  : undefined,
              }}
            />
            {dim.score > 0 && (
              <motion.circle
                cx={ex}
                cy={ey}
                r={hovered ? 4 : 2.5}
                fill={hsl(profile, hovered ? 0.9 : 0.5)}
                animate={{ scale: hovered ? [1, 1.2, 1] : 1 }}
                transition={{ repeat: hovered ? Infinity : 0, duration: 1.2 }}
              />
            )}
          </g>
        )
      })}
      {tip && (
        <foreignObject
          x={Math.min(size - 168, Math.max(8, tip.x - 84))}
          y={Math.min(size - 72, Math.max(8, tip.y - 48))}
          width={168}
          height={72}
          className="pointer-events-none overflow-visible"
        >
          <div className="rounded-lg border border-border/40 bg-card/95 px-2.5 py-2 text-[10px] leading-snug shadow-lg backdrop-blur-sm">
            <p className="font-medium text-foreground">{tip.dim.label}</p>
            <p className="text-muted-foreground">{tip.dim.description}</p>
            {tip.dim.evidence[0] && (
              <p className="mt-1 line-clamp-2 text-foreground/70">
                「{tip.dim.evidence[0]}」
              </p>
            )}
          </div>
        </foreignObject>
      )}
    </svg>
  )
}
