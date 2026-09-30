import path from "node:path"
import { BrowserWindow, type IpcMainEvent } from "electron"
import type { StoragePaths } from "./types"

interface PathGuardCtx {
  getPaths: () => StoragePaths
  dialog: import("electron").Dialog
}

/** 判断 target 是否落在 base 目录内（含 base 本身）。 */
function isPathWithin(target: string, base: string): boolean {
  const rel = path.relative(base, target)
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
}

/** 允许操作的根目录：数据目录、模型目录、工作区。 */
function getAllowedRoots(paths: StoragePaths): string[] {
  return [paths.dataRoot, paths.workspaceDir].filter(
    (p): p is string => Boolean(p)
  )
}

/**
 * 断言路径在允许范围内。
 * - 落在白名单根目录内：直接放行
 * - 超出白名单：弹确认框，用户同意才放行；否则抛错
 *
 * 用于 fs:* IPC handler，防止渲染进程任意读写系统文件。
 */
export async function assertPathAllowed(
  ctx: PathGuardCtx,
  event: IpcMainEvent,
  targetPath: string,
  action: string
): Promise<void> {
  const roots = getAllowedRoots(ctx.getPaths())
  const resolved = path.resolve(targetPath)

  // 首次启动 / 未配置路径时放行，避免阻塞初始化
  if (roots.length === 0) return
  if (roots.some((root) => isPathWithin(resolved, path.resolve(root)))) return

  // 超出白名单 → 请求用户确认
  const parent = BrowserWindow.fromWebContents(event.sender)
  const options = {
    type: "warning" as const,
    title: "路径访问确认",
    message: `${action}应用目录外文件`,
    detail: `应用尝试${action}：\n${resolved}\n\n该路径不在数据目录、模型目录或工作区内。是否允许本次操作？`,
    buttons: ["允许一次", "取消"],
    defaultId: 1,
    cancelId: 1,
  }
  const result = parent
    ? await ctx.dialog.showMessageBox(parent, options)
    : await ctx.dialog.showMessageBox(options)

  if (result.response !== 0) {
    throw new Error(`已拒绝${action}应用目录外路径：${resolved}`)
  }
}
