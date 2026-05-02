import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { createPortal } from "react-dom"

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
  hue: number
}

/**
 * 漂浮粒子效果
 */
export function FloatingParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animIdRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()

    const colors = [
      { h: 30, s: 100 },  // amber
      { h: 120, s: 60 },  // sage green
      { h: 270, s: 60 },  // lavender
      { h: 15, s: 90 },   // coral
    ]

    const initParticles = () => {
      particlesRef.current = Array.from({ length: 20 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 3 + 1,
        opacity: Math.random() * 0.4 + 0.1,
        hue: colors[Math.floor(Math.random() * colors.length)].h,
      }))
    }
    initParticles()

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particlesRef.current.forEach((p) => {
        p.x += p.vx
        p.y += p.vy

        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 70%, 70%, ${p.opacity})`
        ctx.fill()
      })

      animIdRef.current = requestAnimationFrame(draw)
    }

    draw()

    const handleResize = () => {
      resize()
      initParticles()
    }
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      cancelAnimationFrame(animIdRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[1]"
      style={{ opacity: 0.5 }}
    />
  )
}

/**
 * 鼠标跟随光点
 */
export function CursorGlow({ children }: { children: React.ReactNode }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY })
    }
    const handleEnter = () => setIsVisible(true)
    const handleLeave = () => setIsVisible(false)

    document.addEventListener("mousemove", handleMove)
    document.addEventListener("mouseenter", handleEnter)
    document.addEventListener("mouseleave", handleLeave)

    return () => {
      document.removeEventListener("mousemove", handleMove)
      document.removeEventListener("mouseenter", handleEnter)
      document.removeEventListener("mouseleave", handleLeave)
    }
  }, [])

  return (
    <>
      {children}
      {isVisible && createPortal(
        <motion.div
          className="pointer-events-none fixed z-[9999] size-48 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(255,180,80,0.15) 0%, transparent 70%)",
            left: mousePos.x - 96,
            top: mousePos.y - 96,
          }}
          animate={{ x: 0, y: 0 }}
          transition={{ type: "spring", stiffness: 150, damping: 15 }}
        />,
        document.body
      )}
    </>
  )
}

/**
 * 页面过渡动画
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="flex flex-col h-full min-h-0"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/**
 * 卡片入场动画
 */
export function CardFloat({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/**
 * 脉冲呼吸效果
 */
export function PulseDot({ color = "bg-primary" }: { color?: string }) {
  return (
    <motion.span
      className={`inline-block size-2 rounded-full ${color}`}
      animate={{
        scale: [1, 1.2, 1],
        opacity: [0.6, 1, 0.6],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  )
}

/**
 * 渐入动画
 */
export function FadeIn({
  children,
  delay = 0,
  direction = "up",
}: {
  children: React.ReactNode
  delay?: number
  direction?: "up" | "down" | "left" | "right"
}) {
  const variants = {
    up: { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } },
    down: { initial: { opacity: 0, y: -20 }, animate: { opacity: 1, y: 0 } },
    left: { initial: { opacity: 0, x: -20 }, animate: { opacity: 1, x: 0 } },
    right: { initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 } },
  }

  return (
    <motion.div
      initial={variants[direction].initial}
      animate={variants[direction].animate}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/**
 * 按钮点击涟漪效果
 */
export function RippleButton({
  children,
  className = "",
  onClick,
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([])

  const handleClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const id = Date.now()

    setRipples((prev) => [...prev, { x, y, id }])
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id))
    }, 600)

    onClick?.()
  }

  return (
    <div className={`relative overflow-hidden ${className}`} onClick={handleClick}>
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          className="absolute rounded-full bg-white/30"
          initial={{ width: 0, height: 0, opacity: 0.5 }}
          animate={{ width: 200, height: 200, opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{
            left: r.x,
            top: r.y,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
      {children}
    </div>
  )
}

/**
 * SVG 装饰性波浪分隔线
 */
export function WaveDivider({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`w-full h-8 ${className}`}
      viewBox="0 0 1200 30"
      preserveAspectRatio="none"
      fill="none"
    >
      <path
        d="M0,15 Q150,0 300,15 T600,15 T900,15 T1200,15"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.2"
        fill="none"
      >
        <animate
          attributeName="d"
          dur="8s"
          repeatCount="indefinite"
          values="
            M0,15 Q150,0 300,15 T600,15 T900,15 T1200,15;
            M0,15 Q150,30 300,15 T600,15 T900,15 T1200,15;
            M0,15 Q150,0 300,15 T600,15 T900,15 T1200,15
          "
        />
      </path>
    </svg>
  )
}

/**
 * 星星闪烁背景
 */
export function SparkleBg() {
  const [sparks, setSparks] = useState<
    { id: number; x: number; y: number; size: number; delay: number }[]
  >([])

  useEffect(() => {
    setSparks(
      Array.from({ length: 15 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2 + 1,
        delay: Math.random() * 3,
      }))
    )
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-[1]">
      {sparks.map((s) => (
        <motion.div
          key={s.id}
          className="absolute rounded-full bg-amber-200"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
          }}
          animate={{
            opacity: [0.2, 0.8, 0.2],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: 2,
            delay: s.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  )
}

/**
 * 加载骨架屏闪烁
 */
export function SkeletonShimmer() {
  return (
    <motion.div
      className="h-4 rounded-full bg-muted/60"
      animate={{
        backgroundColor: ["rgba(var(--muted), 0.6)", "rgba(var(--muted), 0.3)", "rgba(var(--muted), 0.6)"],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  )
}