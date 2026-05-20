const fs = require("node:fs/promises")
const fsSync = require("node:fs")
const path = require("node:path")
const { Readable } = require("node:stream")
const { pipeline } = require("node:stream/promises")
const { createWriteStream } = require("node:fs")
const { downloadFile, fileDownloadInfo } = require("@huggingface/hub")

const HUB_ENDPOINTS = [
  { hubUrl: "https://hf-mirror.com", label: "hf-mirror" },
  { hubUrl: "https://huggingface.co", label: "huggingface.co" },
]

/**
 * @param {object} model
 * @param {string} destination
 * @param {(progress: { downloadedBytes: number; totalBytes: number; progress: number | null }) => void} onProgress
 */
async function downloadModelFile(model, destination, onProgress) {
  await fs.mkdir(path.dirname(destination), { recursive: true })

  const tempPath = `${destination}.part`
  if (fsSync.existsSync(tempPath)) {
    await fs.rm(tempPath, { force: true })
  }

  let lastError = null
  for (const endpoint of HUB_ENDPOINTS) {
    try {
      await downloadFromHub(model, destination, tempPath, endpoint.hubUrl, onProgress)
      return { source: endpoint.label }
    } catch (error) {
      lastError = error
      if (fsSync.existsSync(tempPath)) {
        await fs.rm(tempPath, { force: true })
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Download failed"))
}

async function downloadFromHub(model, destination, tempPath, hubUrl, onProgress) {
  const repoParams = {
    repo: { type: "model", name: model.repo },
    path: model.repoPath,
    revision: model.revision ?? "main",
    hubUrl,
  }

  const info = await fileDownloadInfo(repoParams)
  if (!info) {
    throw new Error(`在 Hugging Face 上未找到文件：${model.repo}/${model.repoPath}`)
  }

  const totalBytes = info.size || model.sizeBytes || 0
  onProgress({ downloadedBytes: 0, totalBytes, progress: totalBytes > 0 ? 0 : null })

  const blob = await downloadFile({
    ...repoParams,
    downloadInfo: info,
    xet: true,
  })
  if (!blob) {
    throw new Error("下载响应为空")
  }

  let downloadedBytes = 0
  const stream = Readable.fromWeb(blob.stream())
  stream.on("data", (chunk) => {
    downloadedBytes += chunk.length
    const progress = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : null
    onProgress({ downloadedBytes, totalBytes, progress })
  })

  await pipeline(stream, createWriteStream(tempPath))

  const stat = await fs.stat(tempPath)
  if (info.size > 0 && stat.size !== info.size) {
    throw new Error(`文件不完整：期望 ${info.size} 字节，实际 ${stat.size} 字节`)
  }

  await fs.rename(tempPath, destination)
}

module.exports = { downloadModelFile, HUB_ENDPOINTS }
