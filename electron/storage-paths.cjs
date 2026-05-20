const path = require("node:path")
const fs = require("node:fs/promises")
const fsSync = require("node:fs")

const CONFIG_NAME = "storage-paths.json"

let cachedPaths = null

function getConfigFilePath(app) {
  return path.join(app.getPath("userData"), CONFIG_NAME)
}

function getSystemDefaultPaths(app) {
  const dataRoot = app.getPath("userData")
  return {
    dataRoot,
    modelsDir: path.join(dataRoot, "models"),
  }
}

function readOverrides(app) {
  const configFile = getConfigFilePath(app)
  if (!fsSync.existsSync(configFile)) return null
  try {
    const raw = JSON.parse(fsSync.readFileSync(configFile, "utf8"))
    if (!raw || typeof raw !== "object") return null
    return raw
  } catch {
    return null
  }
}

function normalizeAbsolutePath(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}不能为空`)
  }
  const resolved = path.resolve(value.trim())
  if (!path.isAbsolute(resolved)) {
    throw new Error(`${label}必须是绝对路径`)
  }
  return resolved
}

function buildResolved(app, overrides) {
  const systemDefaults = getSystemDefaultPaths(app)
  const dataRoot = overrides?.dataRoot
    ? normalizeAbsolutePath(overrides.dataRoot, "数据目录")
    : systemDefaults.dataRoot
  const modelsDir = overrides?.modelsDir
    ? normalizeAbsolutePath(overrides.modelsDir, "大模型目录")
    : path.join(dataRoot, "models")

  return {
    dataRoot,
    modelsDir,
    databaseFile: path.join(dataRoot, "memories.db"),
    memoriesDir: path.join(dataRoot, "memories"),
    personasDir: path.join(dataRoot, "personas"),
    skillsDir: path.join(dataRoot, "skills"),
    configFile: getConfigFilePath(app),
    defaultDataRoot: systemDefaults.dataRoot,
    defaultModelsDir: systemDefaults.modelsDir,
    isCustomized: Boolean(overrides?.dataRoot || overrides?.modelsDir),
  }
}

function resolveStoragePaths(app, { fresh = false } = {}) {
  if (!fresh && cachedPaths) return cachedPaths
  const overrides = readOverrides(app)
  cachedPaths = buildResolved(app, overrides)
  return cachedPaths
}

function invalidateStoragePathsCache() {
  cachedPaths = null
}

async function ensureStorageDirs(paths) {
  await fs.mkdir(paths.dataRoot, { recursive: true })
  await fs.mkdir(paths.modelsDir, { recursive: true })
  await fs.mkdir(paths.memoriesDir, { recursive: true })
  await fs.mkdir(paths.personasDir, { recursive: true })
  await fs.mkdir(paths.skillsDir, { recursive: true })
}

async function saveStoragePaths(app, input) {
  const dataRoot = normalizeAbsolutePath(input.dataRoot, "数据目录")
  const modelsDir = input.modelsDir?.trim()
    ? normalizeAbsolutePath(input.modelsDir, "大模型目录")
    : path.join(dataRoot, "models")

  const nextOverrides = { dataRoot, modelsDir }
  const resolved = buildResolved(app, nextOverrides)
  await ensureStorageDirs(resolved)
  await fs.writeFile(getConfigFilePath(app), JSON.stringify(nextOverrides, null, 2), "utf8")
  invalidateStoragePathsCache()
  return resolveStoragePaths(app, { fresh: true })
}

async function resetStoragePaths(app) {
  const configFile = getConfigFilePath(app)
  if (fsSync.existsSync(configFile)) {
    await fs.rm(configFile, { force: true })
  }
  invalidateStoragePathsCache()
  const resolved = resolveStoragePaths(app, { fresh: true })
  await ensureStorageDirs(resolved)
  return resolved
}

module.exports = {
  CONFIG_NAME,
  getConfigFilePath,
  resolveStoragePaths,
  saveStoragePaths,
  resetStoragePaths,
  invalidateStoragePathsCache,
  ensureStorageDirs,
}
