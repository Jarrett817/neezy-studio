import scrollPaperTexture from "~/assets/memory/scroll-paper-texture.svg"
import { cn } from "~/lib/utils"

/** 卷轴纸张纹理（资源见 app/assets/memory/scroll-paper-texture.svg） */
export function MemoryScrollTexture({ className }: { className?: string }) {
  return (
    <img
      src={scrollPaperTexture}
      alt=""
      aria-hidden
      className={cn("pointer-events-none size-full object-cover", className)}
      draggable={false}
    />
  )
}
