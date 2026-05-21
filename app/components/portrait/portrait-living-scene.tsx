import { useEffect, useRef, useState } from "react"
import { motion, useAnimationFrame } from "framer-motion"

import { hsl, type PortraitVisualProfile } from "~/lib/portrait-visual"
import type { PortraitDimension } from "~/services/user-portrait"
import { cn } from "~/lib/utils"

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  phase: number
}

function seedParticles(
  count: number,
  profile: PortraitVisualProfile
): Particle[] {
  const spread = 28 + profile.particleSpread * 42
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2
    const dist = spread * (0.35 + Math.random() * 0.65)
    return {
      x: 50 + Math.cos(angle) * dist,
      y: 50 + Math.sin(angle) * dist,
      vx: (Math.random() - 0.5) * (0.04 + profile.particleChaos * 0.12),
      vy: (Math.random() - 0.5) * (0.04 + profile.particleChaos * 0.12),
      r: 0.35 + Math.random() * (0.5 + profile.particleDensity * 0.8),
      phase: Math.random() * Math.PI * 2,
    }
  })
}

function PortraitCore({
  profile,
  hasData,
  breath,
  pulse,
}: {
  profile: PortraitVisualProfile
  hasData: boolean
  breath: number
  pulse: number
}) {
  const baseR = 16 * profile.coreScale * breath * pulse

  return (
    <g>
      <defs>
        <radialGradient id="portrait-core-outer" cx="50%" cy="50%" r="50%">
          <stop
            offset="0%"
            stopColor={hsl(profile, hasData ? 0.95 : 0.35, 12)}
          />
          <stop offset="35%" stopColor={hsl(profile, hasData ? 0.55 : 0.2)} />
          <stop offset="72%" stopColor={hsl(profile, 0.12)} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="portrait-core-inner" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
          <stop offset="40%" stopColor={hsl(profile, 0.4, 6)} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="portrait-ambient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={hsl(profile, hasData ? 0.12 : 0.05)} />
          <stop offset="45%" stopColor={hsl(profile, 0.04)} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="49" fill="url(#portrait-ambient)" />
      {Array.from({ length: 8 }, (_, i) => (
        <motion.circle
          key={i}
          cx={50 + Math.cos((i / 8) * Math.PI * 2) * baseR * 0.55}
          cy={50 + Math.sin((i / 8) * Math.PI * 2) * baseR * 0.55}
          r={baseR * 0.4}
          fill={hsl(profile, 0.08 * breath)}
          animate={{
            cx: [
              50 + Math.cos((i / 8) * Math.PI * 2) * baseR * 0.55,
              50 + Math.cos((i / 8) * Math.PI * 2 + 0.2) * baseR * 0.58,
              50 + Math.cos((i / 8) * Math.PI * 2) * baseR * 0.55,
            ],
            cy: [
              50 + Math.sin((i / 8) * Math.PI * 2) * baseR * 0.55,
              50 + Math.sin((i / 8) * Math.PI * 2 + 0.2) * baseR * 0.58,
              50 + Math.sin((i / 8) * Math.PI * 2) * baseR * 0.55,
            ],
          }}
          transition={{
            duration: profile.breathPeriod,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.12,
          }}
        />
      ))}
      <motion.circle
        cx="50"
        cy="50"
        r={baseR * 1.2}
        fill="url(#portrait-core-outer)"
        animate={{ r: [baseR * 1.15, baseR * 1.25, baseR * 1.15] }}
        transition={{
          duration: profile.breathPeriod,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.circle
        cx="50"
        cy="50"
        r={baseR * 0.7}
        fill="url(#portrait-core-inner)"
        animate={{ r: [baseR * 0.65, baseR * 0.75, baseR * 0.65] }}
        transition={{
          duration: profile.breathPeriod,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </g>
  )
}

function PortraitParticleField({
  profile,
  hasData,
  mouse,
}: {
  profile: PortraitVisualProfile
  hasData: boolean
  mouse: { x: number; y: number }
}) {
  const particlesRef = useRef<Particle[]>(
    seedParticles(Math.floor(36 + profile.particleDensity * 28), profile)
  )
  const [, tick] = useState(0)
  const mouseRef = useRef(mouse)
  const profileRef = useRef(profile)
  mouseRef.current = mouse
  profileRef.current = profile

  useEffect(() => {
    particlesRef.current = seedParticles(
      Math.floor(36 + profile.particleDensity * 28),
      profile
    )
  }, [
    profile.particleDensity,
    profile.particleSpread,
    profile.particleChaos,
    profile.hue,
  ])

  useAnimationFrame((time) => {
    const p = profileRef.current
    const t = time / 1000
    const cx = 50
    const cy = 50
    const baseR = 16 * p.coreScale
    const orbitR = baseR * (2.4 + p.particleSpread * 1.6)
    const mx = mouseRef.current.x
    const my = mouseRef.current.y

    for (const particle of particlesRef.current) {
      const dx = particle.x - cx
      const dy = particle.y - cy
      const dist = Math.hypot(dx, dy) || 0.01
      const toOrbit = dist > orbitR ? -0.02 : 0.015 * (1 - dist / orbitR)
      particle.vx += (dx / dist) * toOrbit
      particle.vy += (dy / dist) * toOrbit

      const mdx = particle.x - mx
      const mdy = particle.y - my
      const md = Math.hypot(mdx, mdy)
      if (md < 14) {
        const force = (14 - md) / 14
        particle.vx += (mdx / (md || 0.01)) * force * 0.5
        particle.vy += (mdy / (md || 0.01)) * force * 0.5
      }

      const chaos = 0.02 + p.particleChaos * 0.04
      particle.vx += Math.sin(t + particle.phase) * chaos * 0.08
      particle.vy += Math.cos(t * 0.9 + particle.phase) * chaos * 0.08
      particle.vx *= 0.985
      particle.vy *= 0.985
      particle.x += particle.vx
      particle.y += particle.vy

      if (particle.x < 2 || particle.x > 98) particle.vx *= -1
      if (particle.y < 2 || particle.y > 98) particle.vy *= -1
      particle.x = Math.max(2, Math.min(98, particle.x))
      particle.y = Math.max(2, Math.min(98, particle.y))
    }

    tick((n) => (n + 1) % 10000)
  })

  return (
    <g>
      {particlesRef.current.map((particle, i) => {
        const dist = Math.hypot(particle.x - 50, particle.y - 50)
        const orbitR =
          16 * profile.coreScale * (2.4 + profile.particleSpread * 1.6)
        const alpha = 0.15 + (1 - Math.min(1, dist / (orbitR * 1.2))) * 0.45
        return (
          <circle
            key={i}
            cx={particle.x}
            cy={particle.y}
            r={particle.r}
            fill={hsl(profile, alpha * (hasData ? 1 : 0.4), 8)}
          />
        )
      })}
    </g>
  )
}

/** 活体人格场：SVG + Framer Motion（无原生 Canvas API） */
export function PortraitLivingScene({
  profile,
  dimensions: _dimensions,
  hasData,
  className,
}: {
  profile: PortraitVisualProfile
  dimensions: PortraitDimension[]
  hasData: boolean
  className?: string
}) {
  const [mouse, setMouse] = useState({ x: -999, y: -999 })
  const [breath, setBreath] = useState(1)
  const [pulse, setPulse] = useState(1)
  const profileRef = useRef(profile)
  profileRef.current = profile

  useAnimationFrame((time) => {
    const p = profileRef.current
    const t = time / 1000
    setBreath(
      1 +
        Math.sin((t * Math.PI * 2) / p.breathPeriod) *
          p.breathDepth *
          (hasData ? 1 : 0.35)
    )
    setPulse(1 + Math.sin(t * (2.2 + p.vitality * 3.5)) * 0.04 * p.vitality)
  })

  const toSvgCoords = (clientX: number, clientY: number, rect: DOMRect) => ({
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 100,
  })

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className={cn("h-full w-full", className)}
      aria-hidden={!hasData}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setMouse(toSvgCoords(e.clientX, e.clientY, rect))
      }}
      onMouseLeave={() => setMouse({ x: -999, y: -999 })}
    >
      <PortraitParticleField
        profile={profile}
        hasData={hasData}
        mouse={mouse}
      />
      <PortraitCore
        profile={profile}
        hasData={hasData}
        breath={breath}
        pulse={pulse}
      />
    </svg>
  )
}
