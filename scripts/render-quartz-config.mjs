import { readFileSync, writeFileSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")

const wrapperConfigPath = path.join(repoRoot, "wrapper.config.yaml")
const quartzConfigPath = path.join(repoRoot, "quartz", "quartz.config.ts")

function fail(message) {
  console.error(`[error] ${message}`)
  process.exit(1)
}

if (!existsSync(wrapperConfigPath)) {
  fail(`Missing config file: ${wrapperConfigPath}`)
}

if (!existsSync(quartzConfigPath)) {
  fail(
    "Quartz config not found. Initialize submodule first: `npm run quartz:init`.",
  )
}

const wrapperConfig = YAML.parse(readFileSync(wrapperConfigPath, "utf8")) ?? {}
const siteTitle = wrapperConfig?.site?.title ?? "My Obsidian Wiki"
const siteDescription =
  wrapperConfig?.site?.description ??
  "Published from an Obsidian vault using Quartz"

const siteUrlEnv = process.env.SITE_URL?.trim() ?? ""
const repoNameEnv = process.env.REPO_NAME?.trim() ?? ""
const isDevMode = process.argv.includes("--dev")

function computeBaseUrl(siteUrl, repoName) {
  if (!siteUrl) {
    return "localhost"
  }

  let parsed
  try {
    parsed = new URL(siteUrl)
  } catch {
    fail(
      `SITE_URL must be a valid URL (example: https://username.github.io). Received: ${siteUrl}`,
    )
  }

  let pathname = parsed.pathname.replace(/\/+$/, "")
  if (repoName) {
    const suffix = `/${repoName}`
    if (pathname === "" || pathname === "/") {
      pathname = suffix
    } else if (!pathname.endsWith(suffix)) {
      pathname = `${pathname}${suffix}`
    }
  }

  return `${parsed.host}${pathname}`
}

const computedBaseUrl = isDevMode
  ? "localhost"
  : computeBaseUrl(siteUrlEnv, repoNameEnv)

let configSource = readFileSync(quartzConfigPath, "utf8")

function replaceOrWarn(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    console.warn(
      `[warn] Could not find ${label} in quartz.config.ts. Quartz may have changed config shape.`,
    )
    return source
  }
  return source.replace(pattern, replacement)
}

configSource = replaceOrWarn(
  configSource,
  /pageTitle:\s*["'`][^"'`]*["'`]/,
  `pageTitle: ${JSON.stringify(siteTitle)}`,
  "pageTitle",
)

configSource = replaceOrWarn(
  configSource,
  /baseUrl:\s*["'`][^"'`]*["'`]/,
  `baseUrl: ${JSON.stringify(computedBaseUrl)}`,
  "baseUrl",
)

configSource = replaceOrWarn(
  configSource,
  /description:\s*["'`][^"'`]*["'`]/,
  `description: ${JSON.stringify(siteDescription)}`,
  "description",
)

writeFileSync(quartzConfigPath, configSource, "utf8")
console.log(`[info] Updated quartz config with title "${siteTitle}" and baseUrl "${computedBaseUrl}".`)
