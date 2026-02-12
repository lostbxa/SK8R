import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Minimatch } from "minimatch"
import YAML from "yaml"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")

const configPath = path.join(repoRoot, "wrapper.config.yaml")
const quartzContentPath = path.join(repoRoot, "quartz", "content")
const allowExistingContent = process.argv.includes("--allow-existing-content")

const ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".pdf",
  ".avif",
  ".mp4",
  ".mov",
  ".mp3",
  ".wav",
  ".m4a",
])

function logWarn(message) {
  console.warn(`[warn] ${message}`)
}

function fail(message) {
  console.error(`[error] ${message}`)
  process.exit(1)
}

function normalizeRel(relPath) {
  return relPath.split(path.sep).join("/")
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function isExternalLink(linkTarget) {
  return /^(?:[a-z]+:)?\/\//i.test(linkTarget) || linkTarget.startsWith("mailto:")
}

function hasFileExtension(target) {
  return path.extname(target) !== ""
}

function safeDecodeURIComponent(input) {
  try {
    return decodeURIComponent(input)
  } catch {
    return input
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function compileIgnores(patterns) {
  return (patterns ?? []).map(
    (pattern) =>
      new Minimatch(pattern, {
        dot: true,
        nocase: process.platform === "win32",
      }),
  )
}

function isIgnored(relPath, ignoreMatchers) {
  const unixRel = normalizeRel(relPath)
  for (const matcher of ignoreMatchers) {
    if (matcher.match(unixRel)) return true
    if (matcher.match(`${unixRel}/`)) return true
  }
  return false
}

async function walkSorted(rootDir) {
  const files = []
  const dirs = [rootDir]

  while (dirs.length > 0) {
    const current = dirs.pop()
    const entries = await fs.readdir(current, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name, "en"))

    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]
      const absPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        dirs.push(absPath)
      } else if (entry.isFile()) {
        files.push(absPath)
      }
    }
  }

  files.sort((a, b) => a.localeCompare(b, "en"))
  return files
}

function buildRuleRegex(rule) {
  if (!rule || typeof rule.match !== "string" || typeof rule.replace !== "string") {
    return null
  }

  const flags = typeof rule.flags === "string" && rule.flags.length > 0 ? rule.flags : "g"
  try {
    return {
      regex: new RegExp(rule.match, flags),
      replace: rule.replace,
    }
  } catch {
    return null
  }
}

function splitWikilink(rawInner) {
  const pipeIndex = rawInner.indexOf("|")
  if (pipeIndex === -1) {
    return { target: rawInner.trim(), alias: "" }
  }
  return {
    target: rawInner.slice(0, pipeIndex).trim(),
    alias: rawInner.slice(pipeIndex + 1).trim(),
  }
}

function splitAnchor(target) {
  const hashIndex = target.indexOf("#")
  if (hashIndex === -1) {
    return { pathPart: target, anchor: "" }
  }
  return {
    pathPart: target.slice(0, hashIndex),
    anchor: target.slice(hashIndex + 1),
  }
}

function normalizeInternalTarget(target) {
  const cleaned = stripQuotes(safeDecodeURIComponent(target.trim()))
  return cleaned.replace(/\\/g, "/")
}

async function rewriteMarkdown({
  markdown,
  sourceFilePath,
  sourceRoot,
  attachmentBasenameIndex,
  rules,
}) {
  const sourceDir = path.dirname(sourceFilePath)

  function resolveAssetByBasename(assetTarget) {
    const basename = path.basename(assetTarget).toLowerCase()
    const candidates = attachmentBasenameIndex.get(basename) ?? []
    if (candidates.length === 0) return assetTarget

    let best = candidates[0]
    let bestDepth = Number.POSITIVE_INFINITY

    for (const relCandidate of candidates) {
      const absCandidate = path.join(sourceRoot, relCandidate)
      const relative = normalizeRel(path.relative(sourceDir, absCandidate))
      const depth = relative.split("/").length
      if (depth < bestDepth) {
        bestDepth = depth
        best = relCandidate
      }
    }

    return normalizeRel(best)
  }

  let out = markdown.replace(/\r\n/g, "\n")

  out = out.replace(/(!)?\[\[([^[\]]+?)\]\]/g, (full, embedBang, inner) => {
    const embed = Boolean(embedBang)
    const { target, alias } = splitWikilink(inner)
    if (!target) return full

    const { pathPart, anchor } = splitAnchor(normalizeInternalTarget(target))
    if (!pathPart) return full

    const ext = path.extname(pathPart).toLowerCase()
    let normalizedTarget = pathPart

    if (ASSET_EXTENSIONS.has(ext)) {
      normalizedTarget = resolveAssetByBasename(pathPart)
    } else {
      normalizedTarget = pathPart.replace(/\.md$/i, "")
    }

    const rebuiltInner =
      normalizedTarget +
      (anchor ? `#${anchor}` : "") +
      (alias ? `|${alias}` : "")

    return `${embed ? "!" : ""}[[${rebuiltInner}]]`
  })

  out = out.replace(/(!?)\[([^\]]*)\]\(([^)]+)\)/g, (full, bang, label, rawHref) => {
    const trimmedHref = stripQuotes(rawHref.trim())
    if (!trimmedHref || isExternalLink(trimmedHref) || trimmedHref.startsWith("#")) {
      return full
    }

    const [hrefPathPart, hrefAnchor = ""] = trimmedHref.split("#")
    const normalizedHrefPath = normalizeInternalTarget(hrefPathPart)
    if (!normalizedHrefPath) return full

    const ext = path.extname(normalizedHrefPath).toLowerCase()
    let finalPath = normalizedHrefPath

    if (ASSET_EXTENSIONS.has(ext)) {
      finalPath = resolveAssetByBasename(normalizedHrefPath)
    } else if (ext === ".md") {
      finalPath = normalizedHrefPath.slice(0, -3)
    } else if (!hasFileExtension(normalizedHrefPath)) {
      finalPath = normalizedHrefPath
    }

    const finalHref = hrefAnchor ? `${finalPath}#${hrefAnchor}` : finalPath
    return `${bang}[${label}](${finalHref})`
  })

  for (const rule of rules) {
    out = out.replace(rule.regex, rule.replace)
  }

  return out
}

async function sync() {
  const configSource = await fs.readFile(configPath, "utf8")
  const config = YAML.parse(configSource) ?? {}

  const vaultPath = process.env.VAULT_PATH?.trim()
  const configSubpath = config.publishSubpath ?? ""
  const envSubpath = process.env.VAULT_PUBLISH_SUBPATH
  const publishSubpath = envSubpath !== undefined ? envSubpath : configSubpath

  if (!vaultPath) {
    if (allowExistingContent && (await pathExists(quartzContentPath))) {
      logWarn(
        "VAULT_PATH is not set. Using existing ./quartz/content as-is (no sync performed).",
      )
      return
    }
    fail("VAULT_PATH environment variable is required for sync.")
  }

  const sourceRoot = path.resolve(vaultPath, publishSubpath)
  if (!(await pathExists(sourceRoot))) {
    fail(`Source publish path does not exist: ${sourceRoot}`)
  }

  const ignorePatterns = config.ignorePatterns ?? []
  const ignoreMatchers = compileIgnores(ignorePatterns)
  const attachmentFolderNames = (config.attachmentsFolders ?? ["attachments"]).map((v) =>
    String(v).toLowerCase(),
  )

  const allFiles = await walkSorted(sourceRoot)
  const selectedFiles = []
  const attachmentBasenameIndex = new Map()
  let attachmentFolderDetected = false

  for (const absPath of allFiles) {
    const relPath = normalizeRel(path.relative(sourceRoot, absPath))
    if (isIgnored(relPath, ignoreMatchers)) continue

    selectedFiles.push({ absPath, relPath })

    const pathParts = relPath.split("/")
    const isInAttachmentFolder = pathParts.some((segment) =>
      attachmentFolderNames.includes(segment.toLowerCase()),
    )

    if (isInAttachmentFolder) {
      attachmentFolderDetected = true
      const basename = path.basename(relPath).toLowerCase()
      const existing = attachmentBasenameIndex.get(basename) ?? []
      existing.push(relPath)
      existing.sort((a, b) => a.localeCompare(b, "en"))
      attachmentBasenameIndex.set(basename, existing)
    }
  }

  if (!attachmentFolderDetected) {
    logWarn(
      `No attachments folder found under publish subtree. Expected one of: ${attachmentFolderNames.join(", ")}`,
    )
  }

  await fs.rm(quartzContentPath, { recursive: true, force: true })
  await fs.mkdir(quartzContentPath, { recursive: true })

  const rawRules = Array.isArray(config.linkRewriteRules) ? config.linkRewriteRules : []
  const rewriteRules = rawRules.map(buildRuleRegex).filter(Boolean)

  for (const file of selectedFiles) {
    const destination = path.join(quartzContentPath, file.relPath)
    await fs.mkdir(path.dirname(destination), { recursive: true })

    const ext = path.extname(file.relPath).toLowerCase()
    if (ext === ".md" || ext === ".markdown") {
      const source = await fs.readFile(file.absPath, "utf8")
      const rewritten = await rewriteMarkdown({
        markdown: source,
        sourceFilePath: file.absPath,
        sourceRoot,
        attachmentBasenameIndex,
        rules: rewriteRules,
      })
      await fs.writeFile(destination, rewritten, "utf8")
    } else {
      await fs.copyFile(file.absPath, destination)
    }
  }

  console.log(
    `[info] Synced ${selectedFiles.length} files from "${sourceRoot}" to "${quartzContentPath}".`,
  )
}

sync().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})

