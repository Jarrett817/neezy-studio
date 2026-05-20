import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"

/**
 * 温暖渐变背景 + 浮动光斑
 */
export function WarmAmbientBg() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* 基础渐变 */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-sky-50/60" />

      {/* 动态光斑 1 */}
      <motion.div
        className="absolute h-[500px] w-[500px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255,180,80,0.4) 0%, transparent 70%)",
          left: "10%",
          top: "20%",
        }}
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

      {/* 动态光斑 2 */}
      <motion.div
        className="absolute h-[600px] w-[600px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(180,220,160,0.35) 0%, transparent 70%)",
          right: "5%",
          bottom: "10%",
        }}
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

      {/* 动态光斑 3 */}
      <motion.div
        className="absolute h-[400px] w-[400px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255,200,120,0.35) 0%, transparent 70%)",
          left: "40%",
          top: "60%",
        }}
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

      {/* 小的装饰光斑 */}
      <motion.div
        className="absolute h-[200px] w-[200px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(200,160,255,0.3) 0%, transparent 70%)",
          left: "70%",
          top: "15%",
        }}
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

      {/* 底部暖色 */}
      <div className="absolute right-0 bottom-0 left-0 h-64 bg-gradient-to-t from-orange-100/50 to-transparent" />

      {/* 顶部冷色 */}
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
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            background: "linear-gradient(135deg, #fbbf24 0%, #f97316 100%)",
            boxShadow: "0 0 6px rgba(251,191,36,0.6)",
          }}
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
        <div
          className="pointer-events-none fixed z-[9999] rounded-full"
          style={{
            left: mousePos.x - 150,
            top: mousePos.y - 150,
            width: 300,
            height: 300,
            background:
              "radial-gradient(circle, rgba(255,180,80,0.25) 0%, rgba(255,180,80,0.1) 40%, transparent 70%)",
            transition: "left 0.15s ease-out, top 0.15s ease-out",
          }}
        />
      )}
    </>
  )
}
