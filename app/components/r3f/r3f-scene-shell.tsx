import * as React from "react"
import { Canvas } from "@react-three/fiber"
import { useReducedMotion } from "framer-motion"
import { cn } from "~/lib/utils"

function canUseWebGL() {
  if (typeof document === "undefined") return false
  try {
    const canvas = document.createElement("canvas")
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"))
  } catch {
    return false
  }
}

export function WarmGlassFallback({
  className,
  label = "3D 预览",
}: {
  className?: string
  label?: string
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-2xl border border-dashed border-primary/25",
        "bg-gradient-to-br from-amber-100/50 via-background/30 to-lime-100/40",
        "dark:from-amber-950/30 dark:via-background/20 dark:to-lime-950/20",
        className
      )}
    >
      <div className="size-24 rounded-full bg-gradient-to-br from-primary/30 to-amber-200/50 blur-sm" />
      <p className="absolute text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

export function R3fSceneShell({
  children,
  className,
  heightClass = "h-[300px]",
  fallback,
}: {
  children: React.ReactNode
  className?: string
  /** Tailwind height utility, e.g. h-[420px] or min-h-[320px] */
  heightClass?: string
  fallback?: React.ReactNode
}) {
  const reduced = useReducedMotion()
  const [webglOk] = React.useState(canUseWebGL)

  if (reduced || !webglOk) {
    return (
      <div className={cn(heightClass, className)}>
        {fallback ?? <WarmGlassFallback className="h-full w-full" />}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/40",
        "bg-gradient-to-br from-amber-50/60 via-white/40 to-teal-50/30",
        "dark:from-amber-950/25 dark:via-background/10 dark:to-teal-950/20",
        heightClass,
        className
      )}
    >
      <React.Suspense
        fallback={
          <WarmGlassFallback className="absolute inset-0 h-full w-full rounded-2xl" />
        }
      >
        <Canvas
          className="block size-full"
          camera={{ position: [0, 0.15, 5.2], fov: 38 }}
          dpr={[1, 1.75]}
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0)
          }}
        >
          {children}
        </Canvas>
      </React.Suspense>
    </div>
  )
}
