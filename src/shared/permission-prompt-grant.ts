import type { AgentPermissionPolicy } from "./agent-permissions"

export type PermissionGrantTarget =
  | { kind: "tool"; name: string; pattern?: string }
  | { kind: "bash"; pattern: string }
  | { kind: "mcp"; target: string }
  | { kind: "skill"; name: string }
  | { kind: "special"; key: string }

const MATCHED_PATTERN_RE = / \(matched '([^']*)'\)/

function extractMatchedPattern(text: string): string | undefined {
  const match = text.match(MATCHED_PATTERN_RE)
  return match?.[1]
}

function stripMatchedSuffix(text: string): string {
  return text.replace(MATCHED_PATTERN_RE, "")
}

/** 从 pi-permission-system 询问文案解析可持久化的策略项 */
export function parsePermissionPromptGrant(promptText: string): PermissionGrantTarget | null {
  const text = promptText.trim()
  if (!text) return null

  const bashMatch = text.match(/requested bash command '([^']*)'/)
  if (bashMatch) {
    const pattern =
      extractMatchedPattern(text) ?? (bashMatch[1]?.trim() ? bashMatch[1].trim() : "*")
    return { kind: "bash", pattern }
  }

  const mcpMatch = stripMatchedSuffix(text).match(/requested MCP target '([^']+)'/)
  if (mcpMatch) {
    return { kind: "mcp", target: mcpMatch[1] }
  }

  const skillPathMatch = text.match(/requested access to skill '([^']+)' via/)
  if (skillPathMatch) {
    return { kind: "skill", name: skillPathMatch[1] }
  }

  const skillMatch = text.match(/requested skill '([^']+)'/)
  if (skillMatch) {
    return { kind: "skill", name: skillMatch[1] }
  }

  if (text.includes("outside working directory") && text.includes("Allow this external directory")) {
    return { kind: "special", key: "external_directory" }
  }

  const toolMatch = stripMatchedSuffix(text).match(/requested tool '([^']+)'/)
  if (toolMatch) {
    const name = toolMatch[1]
    const pattern = extractMatchedPattern(text)
    return pattern ? { kind: "tool", name, pattern } : { kind: "tool", name }
  }

  return null
}

export function applyPermissionGrantToPolicy(
  policy: AgentPermissionPolicy,
  target: PermissionGrantTarget
): AgentPermissionPolicy {
  switch (target.kind) {
    case "tool": {
      const key = target.pattern ?? target.name
      return {
        ...policy,
        tools: { ...policy.tools, [key]: "allow" },
      }
    }
    case "bash":
      return {
        ...policy,
        bash: { ...policy.bash, [target.pattern]: "allow" },
      }
    case "mcp":
      return {
        ...policy,
        mcp: { ...policy.mcp, [target.target]: "allow" },
      }
    case "skill":
      return {
        ...policy,
        skills: { ...policy.skills, [target.name]: "allow" },
      }
    case "special":
      return {
        ...policy,
        special: { ...policy.special, [target.key]: "allow" },
      }
  }
}
