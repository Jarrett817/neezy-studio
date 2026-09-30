/** Skill 落盘来源（与 Pi 扫描目录一致） */

export const SKILL_PUBLISHER_IDS = ["agents", "pi-agent"] as const
export type SkillPublisherId = (typeof SKILL_PUBLISHER_IDS)[number]

export function skillInstallKey(
  publisher: SkillPublisherId,
  id: string
): string {
  return `${publisher}:${id}`
}
