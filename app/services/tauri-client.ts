import { buildInfoSchema, type BuildInfo } from "~/schemas/bootstrap"

const FALLBACK_BUILD_INFO: BuildInfo = {
  appName: "Neezy Studio",
  appVersion: "0.1.0",
  target: "web-preview",
  profile: "debug",
}

export async function invokeTauri<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (typeof window === "undefined") {
    throw new Error("Tauri invoke is only available in the client runtime.")
  }
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<T>(command, args)
}

export async function listenTauri<T>(
  event: string,
  handler: (event: { payload: T }) => void
) {
  if (typeof window === "undefined") {
    return () => {}
  }
  const { listen } = await import("@tauri-apps/api/event")
  return listen<T>(event, handler)
}

export async function getBuildInfo(): Promise<BuildInfo> {
  try {
    const result = await invokeTauri("get_build_info")
    return buildInfoSchema.parse(result)
  } catch {
    return FALLBACK_BUILD_INFO
  }
}
