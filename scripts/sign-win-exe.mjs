/**
 * electron-builder afterPack 钩子：把打包出的 Neezy.exe 上传到内网签名服务加签。
 *
 * 环境变量：
 *   SIGN_TOKEN     必填，内网签名 token（也可读 Windows 用户环境变量）
 *   SIGN_URL       签名服务地址，默认 http://10.1.13.232/sign/sign.php
 *   SIGN_UPLOAD_NAME 上传文件名（必须是签名服务白名单里报备过的名字），默认 ezvizhub.exe。
 *                    这只是上传时用的名字，不影响本地实际产物 Neezy.exe。
 *   SIGN_SKIP=1    跳过签名
 */
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const SIGN_URL = (process.env.SIGN_URL || "http://10.1.13.232/sign/sign.php").trim()
const UPLOAD_NAME = (process.env.SIGN_UPLOAD_NAME || "ezvizhub.exe").trim()

function loadUserEnv(name) {
  if (process.platform !== "win32") return ""
  try {
    return execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `[Environment]::GetEnvironmentVariable('${name}','User')`,
      ],
      { encoding: "utf8" }
    ).trim()
  } catch {
    return ""
  }
}

async function signExe(exePath) {
  const input = path.resolve(exePath)
  if (!fs.existsSync(input)) throw new Error(`file not found: ${input}`)

  const token = process.env.SIGN_TOKEN?.trim() || loadUserEnv("SIGN_TOKEN")
  if (!token) throw new Error("SIGN_TOKEN 未设置（进程环境或 Windows 用户环境变量）")

  const bytes = fs.readFileSync(input)
  const form = new FormData()
  form.append("token", token)
  form.append("fd", "sha256")
  form.append("cert_type", "sha256")
  form.append("file", new Blob([bytes]), UPLOAD_NAME)

  console.log(`[sign] ${input} → 上传为 ${UPLOAD_NAME} · ${SIGN_URL}`)
  const res = await fetch(SIGN_URL, { method: "POST", body: form })
  const raw = new Uint8Array(await res.arrayBuffer())
  const asText = new TextDecoder().decode(raw)

  if (!res.ok) {
    if (asText.includes("文件已签名")) {
      console.log("[sign] 跳过：文件已签名")
      return
    }
    throw new Error(`sign failed HTTP ${res.status}: ${asText.slice(0, 500)}`)
  }
  if (raw.byteLength < 1024 || asText.trimStart().startsWith("{")) {
    throw new Error(`sign response unexpected: ${asText.slice(0, 200)}`)
  }

  const tmp = `${input}.signing-tmp`
  fs.writeFileSync(tmp, raw)
  fs.renameSync(tmp, input)
  console.log(`[sign] OK: ${raw.byteLength} bytes → ${input}`)
}

/** electron-builder afterPack 钩子入口 */
export default async function afterPack(context) {
  if (process.env.SIGN_SKIP === "1") {
    console.log("[sign] SIGN_SKIP=1 — 跳过")
    return
  }
  if (context.electronPlatformName !== "win32") return

  const exeName = `${context.packager.appInfo.productFilename}.exe`
  const exePath = path.join(context.appOutDir, exeName)
  await signExe(exePath)
}
