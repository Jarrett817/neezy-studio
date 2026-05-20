import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "~/lib/utils"

/** Tailwind 3D 工具类（替代自定义 CSS） */
export const scene3dClass = {
  stage: "relative perspective-[1100px] perspective-origin-[50%_40%]",
  preserve: "[transform-style:preserve-3d]",
} as const

/** 3D 舞台：透视容器 + 环境光斑 */
export function Scene3DStage({
  children,
  className,
  accent = "warm",
}: {
  children: React.ReactNode
  className?: string
  accent?: "warm" | "cool"
}) {
  const reduced = useReducedMotion()
  const warm = accent === "warm"

  return (
    <div className={cn(scene3dClass.stage, className)}>
      {!reduced && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden>
          <motion.div
            className={cn(
              "absolute -top-16 -left-10 size-56 rounded-full blur-3xl",
              warm ? "bg-primary/20" : "bg-sky-400/15"
            )}
            animate={{ x: [0, 24, 0], y: [0, 12, 0], scale: [1, 1.08, 1] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className={cn(
              "absolute -right-8 bottom-0 size-48 rounded-full blur-3xl",
              warm ? "bg-amber-300/25" : "bg-violet-400/15"
            )}
            animate={{ x: [0, -18, 0], y: [0, -10, 0], scale: [1, 1.12, 1] }}
            transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      )}
      <div className={cn(scene3dClass.preserve, "relative z-[1]")}>{children}</div>
    </div>
  )
}

/** 鼠标跟随倾斜卡片 */
export function TiltCard3D({
  children,
  className,
  depth = 20,
  maxTilt = 10,
}: {
  children: React.ReactNode
  className?: string
  depth?: number
  maxTilt?: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 })

  const handleMove = (e: React.MouseEvent) => {
    if (reduced || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    setTilt({ x: -py * maxTilt, y: px * maxTilt })
  }

  return (
    <div
      ref={ref}
      className={cn(scene3dClass.preserve, className)}
      onMouseMove={handleMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      style={
        reduced
          ? undefined
          : {
              transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
              transition: "transform 0.2s ease-out",
            }
      }
    >
      <div
        className="h-full w-full"
        style={reduced ? undefined : { transform: `translateZ(${depth}px)` }}
      >
        {children}
      </div>
    </div>
  )
}

/** 人格画像：中央光核 + 轨道维度标签 */
export function PortraitOrbit3D({
  dimensions,
  hasData,
}: {
  dimensions: { id: string; label: string; score: number }[]
  hasData: boolean
}) {
  const reduced = useReducedMotion()

  if (!hasData) {
    return (
      <div className="flex aspect-square max-h-[320px] items-center justify-center rounded-full border border-dashed border-border/50 bg-card/30 text-sm text-muted-foreground">
        多聊几轮后点亮人格光核
      </div>
    )
  }

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[320px]">
      {!reduced && (
        <motion.div
          className="absolute inset-[18%] rounded-full bg-primary/25 blur-2xl"
          animate={{ scale: [0.9, 1.05, 0.9], opacity: [0.35, 0.55, 0.35] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <motion.div
        className="absolute inset-[28%] rounded-full border border-primary/30 bg-gradient-to-br from-primary/20 to-amber-200/20 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)]"
        style={{ transform: "translateZ(40px)" }}
        animate={reduced ? undefined : { scale: [1, 1.04, 1] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      />
      {dimensions.map((dim, i) => {
        const angle = (i / dimensions.length) * Math.PI * 2 - Math.PI / 2
        const radius = 46
        const x = 50 + Math.cos(angle) * radius
        const y = 50 + Math.sin(angle) * radius
        const z = 12 + (dim.score / 100) * 28

        return (
          <motion.div
            key={dim.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: reduced ? undefined : `translateZ(${z}px)`,
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06, duration: 0.4 }}
          >
            <div
              className={cn(
                "rounded-full border border-border/40 bg-card/90 px-2.5 py-1 text-center shadow-lg backdrop-blur-sm",
                dim.score >= 40 && "border-primary/40 text-primary"
              )}
            >
              <span className="block text-[10px] font-medium">{dim.label}</span>
              <span className="text-[10px] tabular-nums text-muted-foreground">{dim.score}</span>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

/** 记忆卡片：层叠深度 + 悬停浮起 */
export function MemoryCard3D({
  index,
  children,
  className,
}: {
  index: number
  children: React.ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  const layer = index % 4
  const baseZ = layer * 6
  const baseRotate = (layer - 1.5) * 1.2

  return (
    <motion.div
      className={cn(scene3dClass.preserve, className)}
      initial={reduced ? false : { opacity: 0, y: 16, rotateX: 8 }}
      animate={reduced ? undefined : { opacity: 1, y: 0, rotateX: 0 }}
      transition={{ delay: index * 0.04, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={
        reduced
          ? undefined
          : {
              y: -6,
              rotateX: -4,
              rotateY: baseRotate * 0.5,
              transition: { duration: 0.2 },
            }
      }
      style={
        reduced
          ? undefined
          : {
              transform: `translateZ(${baseZ}px) rotateY(${baseRotate}deg)`,
            }
      }
    >
      <div className="h-full rounded-2xl">{children}</div>
    </motion.div>
  )
}
