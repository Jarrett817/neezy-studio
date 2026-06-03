import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent"
import type { BrowserWindow } from "electron"
import { randomUUID } from "node:crypto"

import type { PermissionGrantTarget } from "../shared/permission-prompt-grant"
import { parsePermissionPromptGrant } from "../shared/permission-prompt-grant"

export type SandboxPermissionAction = "abort" | "session" | "project" | "global"

/** 与 pi-permission-system permission-dialog.ts 一致 */
const PI_APPROVE_OPTION = "Yes"
const PI_DENY_OPTION = "No"
const PI_DENY_WITH_REASON_OPTION = "No, provide reason"
const PI_PERMISSION_SELECT_OPTIONS = [
  PI_APPROVE_OPTION,
  PI_DENY_OPTION,
  PI_DENY_WITH_REASON_OPTION,
] as const

export type PermissionDialogAction =
  | "allow-once"
  | "allow-always"
  | "deny"
  | "deny-reason"

export interface PermissionPromptPayload {
  sessionId: string
  requestId: string
  kind: "select" | "input" | "sandbox" | "permission" | "confirm"
  title: string
  options?: string[]
  placeholder?: string
  grantTarget?: PermissionGrantTarget | null
}

const SANDBOX_UI_ACTIONS: SandboxPermissionAction[] = [
  "session",
  "abort",
  "project",
  "global",
]

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "").trim()
}

type PendingPrompt = {
  resolve: (value: string | undefined) => void
  reject: (reason: unknown) => void
  grantTarget?: PermissionGrantTarget | null
}

export type PermissionRespondPayload = {
  sessionId?: string
  requestId?: string
  action?: PermissionDialogAction
  value?: string
}

const pendingBySession = new Map<string, Map<string, PendingPrompt>>()

function getSessionPending(sessionId: string): Map<string, PendingPrompt> {
  let map = pendingBySession.get(sessionId)
  if (!map) {
    map = new Map()
    pendingBySession.set(sessionId, map)
  }
  return map
}

export function clearPermissionPromptsForSession(sessionId: string): void {
  const map = pendingBySession.get(sessionId)
  if (!map) return
  for (const entry of map.values()) {
    entry.resolve(undefined)
  }
  pendingBySession.delete(sessionId)
}

function isPiPermissionSelectOptions(options: string[]): boolean {
  if (options.length !== PI_PERMISSION_SELECT_OPTIONS.length) return false
  return PI_PERMISSION_SELECT_OPTIONS.every((option, index) => options[index] === option)
}

export function resolvePermissionPrompt(
  sessionId: string,
  requestId: string,
  value: string | undefined
): boolean {
  const entry = pendingBySession.get(sessionId)?.get(requestId)
  if (!entry) return false
  entry.resolve(value)
  pendingBySession.get(sessionId)?.delete(requestId)
  return true
}

export function takePendingPermissionGrant(
  sessionId: string,
  requestId: string
): PermissionGrantTarget | null | undefined {
  return pendingBySession.get(sessionId)?.get(requestId)?.grantTarget
}

function promptUser(
  window: BrowserWindow,
  sessionId: string,
  payload: Omit<PermissionPromptPayload, "sessionId" | "requestId">
): Promise<string | undefined> {
  if (window.isDestroyed()) {
    return Promise.resolve(undefined)
  }

  const requestId = randomUUID()
  const grantTarget =
    payload.kind === "permission" ? (payload.grantTarget ?? null) : undefined
  return new Promise((resolve, reject) => {
    getSessionPending(sessionId).set(requestId, { resolve, reject, grantTarget })
    window.webContents.send("agent:permission-prompt", {
      sessionId,
      requestId,
      ...payload,
    } satisfies PermissionPromptPayload)
  })
}

async function promptSandboxAction(
  window: BrowserWindow,
  sessionId: string,
  title: string
): Promise<SandboxPermissionAction> {
  const value = await promptUser(window, sessionId, {
    kind: "sandbox",
    title,
    options: [...SANDBOX_UI_ACTIONS],
  })
  if (value === "session" || value === "project" || value === "global") {
    return value
  }
  return "abort"
}

async function runExtensionCustomPrompt<T>(
  window: BrowserWindow,
  sessionId: string,
  factory: Parameters<ExtensionUIContext["custom"]>[0]
): Promise<T> {
  const mockTui = { requestRender: () => {} }
  const mockTheme = { fg: (_style: string, text: string) => text }
  const mockKb = {}

  let resolved: T | undefined
  const component = await factory(mockTui as never, mockTheme as never, mockKb as never, (result) => {
    resolved = result as T
  })

  const lines =
    typeof component === "object" &&
    component !== null &&
    "render" in component &&
    typeof component.render === "function"
      ? component.render(120)
      : []
  const title = stripAnsi(lines[0] ?? "") || "沙箱权限确认"

  if (resolved !== undefined) {
    return resolved
  }

  return (await promptSandboxAction(window, sessionId, title)) as T
}

const noopUiMethods: Omit<ExtensionUIContext, "select" | "input" | "notify" | "custom" | "confirm"> = {
  onTerminalInput: () => () => {},
  setStatus: () => {},
  setWorkingMessage: () => {},
  setWorkingVisible: () => {},
  setWorkingIndicator: () => {},
  setHiddenThinkingLabel: () => {},
  setWidget: () => {},
  setFooter: () => {},
  setHeader: () => {},
  setTitle: () => {},
  pasteToEditor: () => {},
  setEditorText: () => {},
  getEditorText: () => "",
  editor: async () => undefined,
  addAutocompleteProvider: () => {},
  setEditorComponent: () => {},
  getEditorComponent: () => undefined,
  get theme() {
    return {} as ExtensionUIContext["theme"]
  },
  getAllThemes: () => [],
  getTheme: () => undefined,
  setTheme: () => ({ success: false, error: "UI not available" }),
  getToolsExpanded: () => false,
  setToolsExpanded: () => {},
}

export function createElectronPermissionUi(
  window: BrowserWindow,
  sessionId: string
): ExtensionUIContext {
  const ui: ExtensionUIContext = {
    ...noopUiMethods,
    confirm: async (title, message) => {
      const body = [title, message].filter(Boolean).join("\n\n")
      const value = await promptUser(window, sessionId, {
        kind: "confirm",
        title: body || title,
      })
      return value === "true"
    },
    custom: <T>(factory: Parameters<ExtensionUIContext["custom"]>[0]) =>
      runExtensionCustomPrompt<T>(window, sessionId, factory),
    select: (title, options) => {
      if (isPiPermissionSelectOptions(options)) {
        const grantTarget = parsePermissionPromptGrant(title)
        return promptUser(window, sessionId, {
          kind: "permission",
          title,
          options: [...options],
          grantTarget,
        })
      }
      return promptUser(window, sessionId, { kind: "select", title, options })
    },
    input: (title, placeholder) =>
      promptUser(window, sessionId, { kind: "input", title, placeholder }),
    notify: (message, type) => {
      if (!window.isDestroyed()) {
        window.webContents.send("agent:permission-notify", { sessionId, message, type })
      }
    },
  }
  return ui
}
