export type RafFlush = () => void

export function createRafBatcher<T>(flush: (payload: T) => void): {
  push: (payload: T) => void
  flush: () => void
  cancel: () => void
} {
  let pending: T | null = null
  let rafId: number | null = null

  const run = () => {
    rafId = null
    const value = pending
    pending = null
    if (value !== null) flush(value)
  }

  return {
    push(payload: T) {
      pending = payload
      if (rafId !== null) return
      rafId = requestAnimationFrame(run)
    },
    flush() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      const value = pending
      pending = null
      if (value !== null) flush(value)
    },
    cancel() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      pending = null
    },
  }
}
