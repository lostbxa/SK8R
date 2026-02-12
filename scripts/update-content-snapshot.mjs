import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")

const quartzContentPath = path.join(repoRoot, "quartz", "content")
const contentSnapshotPath = path.join(repoRoot, "content-snapshot")

function fail(message) {
  console.error(`[error] ${message}`)
  process.exit(1)
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function main() {
  if (!(await pathExists(quartzContentPath))) {
    fail("Missing ./quartz/content. Run `npm run sync` first.")
  }

  await fs.rm(contentSnapshotPath, { recursive: true, force: true })
  await fs.cp(quartzContentPath, contentSnapshotPath, { recursive: true })
  console.log("[info] Updated ./content-snapshot from ./quartz/content.")
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})
