/** 从场景卡片 / 命令面板进入对话页时携带，强制新建会话 */
export const SCENE_CHAT_LAUNCH_STATE = { sceneLaunch: true } as const

export function sceneChatPath(playbookId: string): string {
  return `/chat?playbook=${encodeURIComponent(playbookId.trim())}`
}
