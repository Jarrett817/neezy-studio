import * as React from "react"
import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { Float, MeshTransmissionMaterial, OrbitControls, Sparkles } from "@react-three/drei"
import type { Group, Mesh } from "three"

import { R3fSceneShell, WarmGlassFallback } from "~/components/r3f/r3f-scene-shell"
import { WarmGlassLights } from "~/components/r3f/warm-lights"

type Dim = { label: string; score: number }

function fibonacciSphere(i: number, n: number, radius: number) {
  const phi = Math.acos(1 - (2 * (i + 0.5)) / n)
  const theta = Math.PI * (1 + Math.sqrt(5)) * i
  return {
    x: radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.sin(phi) * Math.sin(theta),
    z: radius * Math.cos(phi),
  }
}

function GlassCore({ hasData }: { hasData: boolean }) {
  const ref = useRef<Mesh>(null)

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * (hasData ? 0.18 : 0.08)
  })

  return (
    <mesh ref={ref} scale={hasData ? 1 : 0.75}>
      <sphereGeometry args={[1, 64, 64]} />
      <MeshTransmissionMaterial
        backside
        backsideThickness={0.25}
        samples={hasData ? 4 : 2}
        resolution={256}
        transmission={0.97}
        thickness={0.65}
        roughness={0.04}
        ior={1.35}
        chromaticAberration={0.04}
        anisotropy={0.12}
        distortion={0.12}
        distortionScale={0.25}
        temporalDistortion={0.08}
        color="#fff3e4"
        attenuationColor="#e8c49a"
        attenuationDistance={1.8}
      />
    </mesh>
  )
}

function DimensionSatellites({ dimensions }: { dimensions: Dim[] }) {
  const group = useRef<Group>(null)
  const satellites = useMemo(
    () =>
      dimensions.map((dim, i) => ({
        ...dim,
        ...fibonacciSphere(i, dimensions.length, 1.55),
        scale: 0.06 + (dim.score / 100) * 0.1,
      })),
    [dimensions]
  )

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y -= delta * 0.12
  })

  return (
    <group ref={group}>
      {satellites.map((s) => (
        <mesh key={s.label} position={[s.x, s.y, s.z]} scale={s.scale}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshPhysicalMaterial
            color={s.score >= 40 ? "#f0b878" : "#f5e8d8"}
            emissive="#e8b070"
            emissiveIntensity={s.score >= 40 ? 0.35 : 0.12}
            roughness={0.2}
            metalness={0.15}
            transmission={0.4}
            thickness={0.2}
          />
        </mesh>
      ))}
    </group>
  )
}

function PortraitSceneContent({
  dimensions,
  hasData,
}: {
  dimensions: Dim[]
  hasData: boolean
}) {
  return (
    <>
      <WarmGlassLights />
      <Sparkles count={hasData ? 55 : 25} scale={5} size={2} speed={0.35} color="#f5d4a8" opacity={0.45} />
      <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.35}>
        <group>
          <GlassCore hasData={hasData} />
          {hasData && dimensions.length > 0 && (
            <DimensionSatellites dimensions={dimensions} />
          )}
        </group>
      </Float>
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate
        autoRotateSpeed={hasData ? 0.55 : 0.25}
        maxPolarAngle={Math.PI * 0.85}
        minPolarAngle={Math.PI * 0.15}
      />
    </>
  )
}

export function PortraitGlassScene({
  dimensions,
  hasData,
  className,
  heightClass = "h-[320px]",
}: {
  dimensions: Dim[]
  hasData: boolean
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
          label={hasData ? "人格光核" : "多聊几轮后点亮"}
        />
      }
    >
      <PortraitSceneContent dimensions={dimensions} hasData={hasData} />
    </R3fSceneShell>
  )
}
