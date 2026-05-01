import { useEffect, useRef } from "react"

/**
 * 温暖呼吸背景动画
 * 在主区域底层展示柔和的渐变光斑缓慢漂浮
 */
export function WarmAmbientBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animId: number
    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener("resize", resize)

    // 温暖光斑配置
    const blobs = [
      { x: 0.2, y: 0.3, r: 280, color: [255, 180, 80], speed: 0.0003, phase: 0 },
      { x: 0.7, y: 0.6, r: 320, color: [180, 220, 160], speed: 0.00025, phase: Math.PI / 2 },
      { x: 0.5, y: 0.2, r: 240, color: [255, 200, 120], speed: 0.00035, phase: Math.PI },
      { x: 0.85, y: 0.15, r: 200, color: [200, 160, 255], speed: 0.00028, phase: Math.PI * 1.5 },
      { x: 0.15, y: 0.8, r: 260, color: [255, 140, 100], speed: 0.00032, phase: Math.PI / 3 },
    ]

    const time = { v: 0 }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      blobs.forEach((blob) => {
        const t = time.v * blob.speed * 1000 + blob.phase
        const offsetX = Math.sin(t) * 60
        const offsetY = Math.cos(t * 0.7) * 40
        const cx = blob.x * canvas.width + offsetX
        const cy = blob.y * canvas.height + offsetY
        const r = blob.r * (1 + Math.sin(t * 0.5) * 0.08)

        const [sr, sg, sb] = blob.color
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
        gradient.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, 0.12)`)
        gradient.addColorStop(0.5, `rgba(${sr}, ${sg}, ${sb}, 0.05)`)
        gradient.addColorStop(1, `rgba(${sr}, ${sg}, ${sb}, 0)`)

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
      })

      time.v = performance.now()
      animId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(animId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 size-full"
      style={{ opacity: 0.7 }}
    />
  )
}
