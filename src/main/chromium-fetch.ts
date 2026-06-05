import { net } from "electron"

/** Node 内置 CA 无法校验部分云服务证书（如 dashscope 的 VeriSign 链）；API 请求走 Chromium + 系统证书库。 */
globalThis.fetch = net.fetch.bind(net) as typeof fetch
