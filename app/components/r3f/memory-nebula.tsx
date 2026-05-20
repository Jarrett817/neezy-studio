import * as React from "react"
import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { Float, OrbitControls, PointMaterial, Points as DreiPoints, Sparkles } from "@react-three/drei"
import * as THREE from "three"
import type { Points } from "three"

import { R3fSceneShell, WarmGlassFallback } from "~/components/r3f/r3f-scene-shell"
import { WarmGlassLights } from "~/components/r3f/warm-lights"

const WARM_PALETTE = ["#f5d4a8", "#e8b87a", "#c8dcc4", "#ffd8b8", "#f0c49a"]

function NebulaPoints({ count }: { count: number }) {
  const ref = useRef<Points>(null)
  const particleCount = Math.min(420, Math.max(48, count * 28))

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3)
    const col = new Float32Array(particleCount * 3)
    const color = new THREE.Color()

    for (let i = 0; i < particleCount; i++) {
      const u = Math.random()
      const v = Math.random()
      const theta = 2 * Math.PI * u
      const phi = Math.acos(2 * v - 1)
      const r = 0.6 + Math.random() * 1.8 * (0.7 + Math.min(count, 12) * 0.03)

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.65
      pos[i * 3 + 2] = r * Math.cos(phi)

      color.set(WARM_PALETTE[i % WARM_PALETTE.length])
      col[i * 3] = color.r
      col[i * 3 + 1] = color.g
      col[i * 3 + 2] = color.b
    }
    return { positions: pos, colors: col }
  }, [particleCount, count])

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.06
      ref.current.rotation.x += delta * 0.02
    }
  })

  return (
    <DreiPoints ref={ref} positions={positions} colors={colors} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        vertexColors
        size={0.12}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        opacity={0.82}
      />
    </DreiPoints>
  )
}

function MemoryNebulaContent({ count }: { count: number }) {
  return (
    <>
      <WarmGlassLights />
      <Sparkles count={35} scale={6} size={1.5} speed={0.25} color="#ffe4c4" opacity={0.35} />
      <Float speed={0.8} floatIntensity={0.2}>
        <NebulaPoints count={count} />
      </Float>
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate
        autoRotateSpeed={0.35}
      />
    </>
  )
}

export function MemoryNebulaScene({
  count,
  className,
  heightClass = "h-[220px]",
}: {
  count: number
  className?: string
  heightClass?: string
}) {
  return (
    <R3fSceneShell
      className={className}
      heightClass={heightClass}
      fallback={
        <WarmGlassFallback
          className="h-full w-full"
          label={count > 0 ? `${count} 条记忆` : "记忆星云"}
        />
      }
    >
      <MemoryNebulaContent count={count} />
    </R3fSceneShell>
  )
}
