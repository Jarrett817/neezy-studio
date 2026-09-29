/** Skill 发布源：仅本地导入 */

export const SKILL_PUBLISHER_IDS = ["local"] as const
export type SkillPublisherId = (typeof SKILL_PUBLISHER_IDS)[number]

export function skillInstallKey(
  publisher: SkillPublisherId,
  id: string
): string {
  return `${publisher}:${id}`
}
