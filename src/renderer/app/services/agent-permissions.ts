import type {
  AgentPermissionPolicy,
  AgentPermissionSettings,
  PermissionExtensionConfig,
  PermissionPresetId,
  PermissionState,
} from "../../../shared/agent-permissions"
import { getElectronApi } from "./electron-client"

export {
  PERMISSION_PRESETS,
  PI_BUILTIN_TOOL_NAMES,
} from "../../../shared/agent-permissions"
export type {
  AgentPermissionPolicy,
  AgentPermissionSettings,
  PermissionExtensionConfig,
  PermissionPresetId,
  PermissionState,
}

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
