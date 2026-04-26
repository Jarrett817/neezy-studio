import { invoke } from "@tauri-apps/api/core"

import { buildInfoSchema, type BuildInfo } from "~/schemas/bootstrap"

const FALLBACK_BUILD_INFO: BuildInfo = {
  appName: "Neezy Studio",
  appVersion: "0.1.0",
  target: "web-preview",
  profile: "debug",
}

export async function getBuildInfo(): Promise<BuildInfo> {
  try {
    const result = await invoke("get_build_info")
    return buildInfoSchema.parse(result)
  } catch {
    return FALLBACK_BUILD_INFO
  }
}
