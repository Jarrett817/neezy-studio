import { motion, useReducedMotion } from "framer-motion"

import { cn } from "~/lib/utils"

/**
 * NOMI 风格拟人头像：圆脸 + 两只同步眨眼的眼睛，按情绪变化。
 *
 * mood：
 *  - "idle"     静止：慢速同步眨眼，偶尔左右看
 *  - "thinking" 思考：眼睛上看 + 脸微浮 + 眨得勤
 *  - "talking"  回答：正常节奏眨眼 + 脸轻微律动
 *
 * 用法：<NomiFace className="size-7" mood="thinking" />
 */
export type NomiMood = "idle" | "thinking" | "talking"

export function NomiFace({
  mood = "idle",
  className,
}: {
  mood?: NomiMood
  className?: string
}) {
  const reduce = useReducedMotion()

  // 脸：思考时上下浮，回答时轻微律动
  const faceAnim =
    reduce || mood === "idle"
      ? {}
      : mood === "thinking"
        ? { y: ["0%", "-9%", "0%"] }
        : { scale: [1, 1.04, 1] }
  const faceTransition =
    mood === "thinking"
      ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" as const }
      : { duration: 0.9, repeat: Infinity, ease: "easeInOut" as const }

  // 眼睛：同步眨（scaleY），idle 偶尔左右看（x），thinking 上看（y）
  const blink = reduce
    ? {}
    : mood === "thinking"
      ? { scaleY: [1, 1, 0.15, 1, 1], y: ["-18%", "-18%", "-18%", "-18%", "-18%"] }
      : mood === "talking"
        ? { scaleY: [1, 1, 0.15, 1, 1] }
        : { scaleY: [1, 1, 0.12, 1, 1, 1], x: ["0%", "22%", "22%", "-22%", "0%", "0%"] }
  const blinkTransition =
    mood === "thinking"
      ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" as const, times: [0, 0.6, 0.68, 0.76, 1] }
      : mood === "talking"
        ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" as const, times: [0, 0.82, 0.9, 0.98, 1] }
        : { duration: 5, repeat: Infinity, ease: "easeInOut" as const, times: [0, 0.5, 0.56, 0.62, 0.8, 1] }

  return (
    <motion.span
      className={cn(
        "relative inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm",
        className
      )}
      animate={faceAnim}
      transition={faceTransition}
      aria-hidden
    >
      <motion.span
        className="absolute left-[30%] top-[38%] h-[26%] w-[16%] rounded-full bg-current"
        style={{ originY: 0.5 }}
        animate={blink}
        transition={blinkTransition}
      />
      <motion.span
        className="absolute right-[30%] top-[38%] h-[26%] w-[16%] rounded-full bg-current"
        style={{ originY: 0.5 }}
        animate={blink}
        transition={blinkTransition}
      />
    </motion.span>
  )
}
