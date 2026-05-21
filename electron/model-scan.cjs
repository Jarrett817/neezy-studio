const fs = require("node:fs/promises")
const path = require("node:path")

const GGUF_PART_SUFFIX = ".gguf.part"

/**
 * 实时扫描 models 目录：完整包为 `.gguf`，未完成下载为 `.gguf.part`。
 * @param {string} modelsDir
 */
async function scanModelsDir(modelsDir) {
  await fs.mkdir(modelsDir, { recursive: true })
  const entries = await fs.readdir(modelsDir, { withFileTypes: true })

  /** @type {Set<string>} */
  const gguf = new Set()
  /** @type {Map<string, { bytes: number }>} key = 目标 .gguf 文件名 */
  const parts = new Map()

  const partStats = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const name = entry.name
    const lower = name.toLowerCase()
    if (lower.endsWith(GGUF_PART_SUFFIX)) {
      const ggufName = name.slice(0, -".part".length)
      partStats.push({ ggufName, filePath: path.join(modelsDir, name) })
      continue
    }
    if (lower.endsWith(".gguf")) {
      gguf.add(name)
    }
  }

  await Promise.all(
    partStats.map(async ({ ggufName, filePath }) => {
      const stat = await fs.stat(filePath)
      parts.set(ggufName, { bytes: stat.size })
    })
  )

  return { gguf, parts }
}

function modelFileCandidates(model) {
  return [model.fileName, ...(model.aliases || [])]
}

function findInstalledModelFile(model, modelsDir, scan) {
  for (const name of modelFileCandidates(model)) {
    if (scan.gguf.has(name)) return path.join(modelsDir, name)
  }
  return null
}

function findPartForModel(model, scan) {
  for (const name of modelFileCandidates(model)) {
    const part = scan.parts.get(name)
    if (part) return { fileName: name, ...part }
  }
  return null
}

/** 保留 API：下载/删除后调用，下一帧 catalog 会重新 scan */
function invalidateModelScanCache() {}

module.exports = {
  invalidateModelScanCache,
  scanModelsDir,
  findInstalledModelFile,
  findPartForModel,
  modelFileCandidates,
  GGUF_PART_SUFFIX,
}
