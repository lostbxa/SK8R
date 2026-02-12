import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const quartzDir = path.join(repoRoot, "quartz")

const args = process.argv.slice(2)

if (args.length === 0) {
  console.error("[error] No Quartz command provided. Example: build --serve")
  process.exit(1)
}

const result = spawnSync(process.execPath, ["quartz/bootstrap-cli.mjs", ...args], {
  cwd: quartzDir,
  stdio: "inherit",
  shell: false,
})

if (result.error) {
  console.error(`[error] Failed to run Quartz: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)

