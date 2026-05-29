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

/** 仅开发/未打包环境启用 electron-log；生产包使用 noop */
export async function initMainLogger(): Promise<void> {
  if (app.isPackaged) return

  const { default: electronLog } = await import("electron-log")
  electronLog.transports.file.level = "debug"
  electronLog.transports.console.level = "debug"
  electronLog.initialize({ preload: false })

  log.info = electronLog.info.bind(electronLog)
  log.warn = electronLog.warn.bind(electronLog)
  log.error = electronLog.error.bind(electronLog)
  log.debug = electronLog.debug.bind(electronLog)
  log.verbose = electronLog.verbose.bind(electronLog)

  log.info("[logger] electron-log enabled (dev)")
}
