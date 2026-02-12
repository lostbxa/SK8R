import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")

const packageJsonPath = path.join(repoRoot, "package.json")

function fail(message) {
  console.error(`[error] ${message}`)
  process.exit(1)
}

if (!existsSync(packageJsonPath)) {
  fail("package.json not found at repository root.")
}

const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"))
const deps = Object.keys(pkg.dependencies ?? {})

function modulePath(name) {
  return path.join(repoRoot, "node_modules", name, "package.json")
}

const missingDeps = deps.filter((depName) => !existsSync(modulePath(depName)))
if (missingDeps.length === 0) {
  process.exit(0)
}

console.log(
  `[info] Missing root dependencies: ${missingDeps.join(", ")}. Running npm install ...`,
)

function runInstall(command, args, useShell = false) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: useShell,
  })
}

// Most reliable under npm-run on Windows: execute npm CLI through current Node.
const npmExecPath = process.env.npm_execpath
let result

if (npmExecPath && existsSync(npmExecPath)) {
  result = runInstall(process.execPath, [npmExecPath, "install"], false)
} else if (process.platform === "win32") {
  result = runInstall("npm", ["install"], true)
} else {
  result = runInstall("npm", ["install"], false)
}

if (result.error) {
  fail(`Failed to run npm install: ${result.error.message}`)
}

if (result.status !== 0) {
  fail("Failed to install root dependencies.")
}
