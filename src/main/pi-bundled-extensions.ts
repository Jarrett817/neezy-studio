import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const BUNDLED_PI_PACKAGES = [
  "pi-web-access",
  "pi-textbrowser",
  "pi-permission-system",
  ...(process.platform === "darwin" || process.platform === "linux" ? (["pi-sandbox"] as const) : []),
] as const

/** 主进程 bundle 在 out/main，须从仓库根定位 node_modules */
function resolveAppPackageRoot(): string {
  let dir =
    typeof import.meta.dirname === "string"
      ? import.meta.dirname
      : path.dirname(fileURLToPath(import.meta.url))

  for (let depth = 0; depth < 10; depth++) {
    const nm = path.join(dir, "node_modules", BUNDLED_PI_PACKAGES[0])
    if (fs.existsSync(path.join(dir, "package.json")) && fs.existsSync(nm)) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

function resolveBundledExtensionEntry(root: string, pkg: string): string {
  const pkgDir = path.join(root, "node_modules", pkg)
  const pkgJsonPath = path.join(pkgDir, "package.json")
  if (fs.existsSync(pkgJsonPath)) {
    const raw = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) as {
      pi?: { extensions?: string[] }
    }
    const fromPi = raw.pi?.extensions?.[0]
    if (fromPi) {
      const entry = path.join(pkgDir, fromPi.replace(/^\.\//, ""))
      if (fs.existsSync(entry)) return entry
    }
  }
  const candidates = [
    path.join(pkgDir, "index.ts"),
    path.join(pkgDir, "src", "index.ts"),
  ]
  const entry = candidates.find((p) => fs.existsSync(p))
  if (!entry) {
    throw new Error(
      `未找到 Pi 扩展 ${pkg}（${candidates.join(" 或 ")}）。请在项目根执行 bun install。`
    )
  }
  return entry
}

/** npm 依赖的 Pi extension 入口绝对路径，供 jiti 加载 */
export function getBundledPiExtensionPaths(): string[] {
  const root = resolveAppPackageRoot()
  return BUNDLED_PI_PACKAGES.map((pkg) => resolveBundledExtensionEntry(root, pkg))
}

const BUNDLED_PI_SKILL_PACKAGES = ["pi-web-access"] as const

export function getBundledPiSkillPaths(): string[] {
  const root = resolveAppPackageRoot()
  return BUNDLED_PI_SKILL_PACKAGES.map((pkg) => {
    const skillsDir = path.join(root, "node_modules", pkg, "skills")
    if (!fs.existsSync(skillsDir)) {
      throw new Error(`未找到 ${pkg} skills（${skillsDir}）。请在项目根执行 bun install。`)
    }
    return skillsDir
  })
}
