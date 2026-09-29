import { app } from "electron"

type LogFn = (...params: unknown[]) => void

export interface MainLogger {
  info: LogFn
  warn: LogFn
  error: LogFn
  debug: LogFn
  verbose: LogFn
}

const noop: LogFn = () => {}

export const log: MainLogger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  verbose: noop,
}

/**
 * 启用 electron-log：
 * - dev：文件 + 控制台，全量 debug
 * - 生产：写文件到 userData/logs，level info+；控制台关闭（避免 stdout 噪声）
 */
export async function initMainLogger(): Promise<void> {
  const { default: electronLog } = await import("electron-log")
  if (app.isPackaged) {
    electronLog.transports.file.level = "info"
    electronLog.transports.console.level = false
  } else {
    electronLog.transports.file.level = "debug"
    electronLog.transports.console.level = "debug"
  }
  electronLog.initialize({ preload: false })

  log.info = electronLog.info.bind(electronLog)
  log.warn = electronLog.warn.bind(electronLog)
  log.error = electronLog.error.bind(electronLog)
  log.debug = electronLog.debug.bind(electronLog)
  log.verbose = electronLog.verbose.bind(electronLog)

  log.info("[logger] electron-log enabled")
}
