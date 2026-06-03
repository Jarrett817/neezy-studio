/** 场景对话：仅加载指定 Skill 文件，避免全量 skills 目录进入 prompt。 */
export interface AgentSceneConfig {
  skillIds: string[]
}
