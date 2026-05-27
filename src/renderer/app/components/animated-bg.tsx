import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"

import { cn } from "~/lib/utils"

/**
 * 温暖渐变背景 + 浮动光斑
 */
export function WarmAmbientBg() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-sky-50/60" />

      <motion.div
        className="absolute top-[20%] left-[10%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(255,180,80,0.4)_0%,transparent_70%)]"
        animate={{
          x: [0, 60, 0],
          y: [0, 40, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <motion.div
        className="absolute right-[5%] bottom-[10%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(180,220,160,0.35)_0%,transparent_70%)]"
        animate={{
          x: [0, -50, 0],
          y: [0, -30, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 5,
        }}
      />

      <motion.div
        className="absolute top-[60%] left-[40%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(255,200,120,0.35)_0%,transparent_70%)]"
        animate={{
          x: [0, 40, 0],
          y: [0, -50, 0],
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 10,
        }}
      />

      <motion.div
        className="absolute top-[15%] left-[70%] h-[200px] w-[200px] rounded-full bg-[radial-gradient(circle,rgba(200,160,255,0.3)_0%,transparent_70%)]"
        animate={{
          x: [0, -30, 0],
          y: [0, 20, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 3,
        }}
      />

      <div className="absolute right-0 bottom-0 left-0 h-64 bg-gradient-to-t from-orange-100/50 to-transparent" />
      <div className="absolute top-0 right-0 left-0 h-32 bg-gradient-to-b from-sky-100/30 to-transparent" />
    </div>
  )
}

/**
 * 星星闪烁
 */
export function SparkleBg() {
  const [sparks] = useState(
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 2,
      delay: Math.random() * 4,
      duration: Math.random() * 2 + 2,
    }))
  )

  return (
    <div className="pointer-events-none fixed inset-0 z-[1]">
      {sparks.map((s) => (
        <motion.div
          key={s.id}
          className={cn(
            "absolute rounded-full bg-linear-to-br from-amber-400 to-orange-500 shadow-[0_0_6px_rgba(251,191,36,0.6)]",
            `left-[${s.x}%]`,
            `top-[${s.y}%]`,
            `size-[${s.size}px]`
          )}
          animate={{
            opacity: [0.1, 0.8, 0.1],
            scale: [0.8, 1.2, 0.8],
          }}
          transition={{
            duration: s.duration,
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
 * 鼠标跟随光晕
 */
export function CursorGlow({ children }: { children: React.ReactNode }) {
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 })
  const [isVisible, setIsVisible] = useState(false)
  const throttleRef = useRef(false)

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (throttleRef.current) return
      throttleRef.current = true
      setMousePos({ x: e.clientX, y: e.clientY })
      setIsVisible(true)
      setTimeout(() => {
        throttleRef.current = false
      }, 50)
    }
    const handleLeave = () => setIsVisible(false)

    window.addEventListener("mousemove", handleMove)
    document.addEventListener("mouseleave", handleLeave)

    return () => {
      window.removeEventListener("mousemove", handleMove)
      document.removeEventListener("mouseleave", handleLeave)
    }
  }, [])

  return (
    <>
      {children}
      {isVisible && (
        <motion.div
          className="pointer-events-none fixed z-[9999] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,rgba(255,180,80,0.25)_0%,rgba(255,180,80,0.1)_40%,transparent_70%)]"
          animate={{
            x: mousePos.x - 150,
            y: mousePos.y - 150,
          }}
          transition={{ type: "tween", duration: 0.15, ease: "easeOut" }}
        />
      )}
    </>
  )
}
