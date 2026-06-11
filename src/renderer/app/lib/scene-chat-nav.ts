/** 从场景卡片 / 命令面板进入场景运行页 */
export const SCENE_CHAT_LAUNCH_STATE = { sceneLaunch: true } as const

export function sceneChatPath(playbookId: string): string {
  return `/scenes/${encodeURIComponent(playbookId.trim())}`
}
