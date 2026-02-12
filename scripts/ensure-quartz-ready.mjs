import { existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const quartzDir = path.join(repoRoot, "quartz")

const installDeps = process.argv.includes("--install")

function fail(message) {
  console.error(`[error] ${message}`)
  process.exit(1)
}

if (!existsSync(path.join(quartzDir, "package.json"))) {
  fail(
    "Quartz submodule is missing. Run `npm run quartz:init` first (or `git submodule update --init --recursive`).",
  )
}

if (installDeps && !existsSync(path.join(quartzDir, "node_modules"))) {
  console.log("[info] Installing Quartz dependencies in ./quartz ...")
  const cmd = process.platform === "win32" ? "npm.cmd" : "npm"
  const result = spawnSync(cmd, ["install"], {
    cwd: quartzDir,
    stdio: "inherit",
    shell: false,
  })

  if (result.status !== 0) {
    fail("Failed to install Quartz dependencies.")
  }
}

