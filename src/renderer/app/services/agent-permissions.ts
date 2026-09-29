import type {
  AgentPermissionPolicy,
  AgentPermissionSettings,
  PermissionExtensionConfig,
  PermissionPresetId,
  PermissionState,
} from "../../../shared/agent-permissions"
import { PERMISSION_PRESETS } from "../../../shared/agent-permissions"
import { getElectronApi } from "./electron-client"

export type {
  AgentPermissionPolicy,
  AgentPermissionSettings,
  PermissionExtensionConfig,
  PermissionPresetId,
  PermissionState,
}

export { PERMISSION_PRESETS, PI_BUILTIN_TOOL_NAMES } from "../../../shared/agent-permissions"

export function getAgentPermissionSettings(): Promise<AgentPermissionSettings> {
  return getElectronApi().getAgentPermissionSettings()
}

export function saveAgentPermissionSettings(input: {
  policy: AgentPermissionPolicy
  extension: PermissionExtensionConfig
}): Promise<AgentPermissionSettings> {
  return getElectronApi().saveAgentPermissionSettings(input)
}

export function resetAgentPermissionSettings(): Promise<AgentPermissionSettings> {
  return getElectronApi().resetAgentPermissionSettings()
}
