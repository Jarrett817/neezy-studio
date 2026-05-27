import { useEffect, useState } from "react"
import { motion } from "framer-motion"

import { cn } from "~/lib/utils"

export function PortraitBreathingText({
  text,
  className,
  breathPeriod = 5.8,
}: {
  text: string
  className?: string
  breathPeriod?: number
}) {
  const [visible, setVisible] = useState("")

  useEffect(() => {
    setVisible("")
    if (!text) return
    let i = 0
    let timer = 0
    const step = () => {
      i += 1
      setVisible(text.slice(0, i))
      if (i < text.length) {
        timer = window.setTimeout(step, 28 + Math.sin(i * 0.4) * 12)
      }
    }
    timer = window.setTimeout(step, 400)
    return () => window.clearTimeout(timer)
  }, [text])

  return (
    <motion.p
      className={cn("text-sm leading-relaxed", className)}
      animate={{
        opacity: [0.82, 1, 0.82],
      }}
      transition={{
        duration: breathPeriod,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      {visible}
      {visible.length < text.length && (
        <span
          className="inline-block w-0.5 animate-pulse bg-primary/60"
          aria-hidden
        />
      )}
    </motion.p>
  )
}
