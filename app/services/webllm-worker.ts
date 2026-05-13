// Web Worker for WebLLM - 将计算密集型任务移到 Worker 线程

import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm"

// 创建 Worker handler
const handler = new WebWorkerMLCEngineHandler()

// 处理来自主线程的消息
self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg)
}