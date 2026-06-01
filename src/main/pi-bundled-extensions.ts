import { createRequire } from "node:module"
import path from "node:path"

const require = createRequire(import.meta.url)

/** npm 打包的 Pi extension（pi-web-access），由 jiti 在运行时加载 */
export function getBundledPiExtensionPaths(): string[] {
  const pkgDir = path.dirname(require.resolve("pi-web-access/package.json"))
  return [path.join(pkgDir, "index.ts")]
}

export function getBundledPiSkillPaths(): string[] {
  const pkgDir = path.dirname(require.resolve("pi-web-access/package.json"))
  const skillsDir = path.join(pkgDir, "skills")
  return [skillsDir]
}
