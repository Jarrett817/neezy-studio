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
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
          aria-hidden
        >
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
      <div className={cn(scene3dClass.preserve, "relative z-[1]")}>
        {children}
      </div>
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
    <motion.div
      ref={ref}
      className={cn(scene3dClass.preserve, className)}
      onMouseMove={handleMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      animate={
        reduced ? undefined : { rotateX: tilt.x, rotateY: tilt.y }
      }
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div
        className={cn(
          "h-full w-full",
          !reduced && `[transform:translateZ(${depth}px)]`
        )}
      >
        {children}
      </div>
    </motion.div>
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
      initial={
        reduced
          ? false
          : { opacity: 0, y: 16, rotateX: 8, z: baseZ, rotateY: baseRotate }
      }
      animate={
        reduced
          ? undefined
          : { opacity: 1, y: 0, rotateX: 0, z: baseZ, rotateY: baseRotate }
      }
      transition={{
        delay: index * 0.04,
        duration: 0.45,
        ease: [0.22, 1, 0.36, 1],
      }}
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
    >
      <div className="h-full rounded-2xl">{children}</div>
    </motion.div>
  )
}
