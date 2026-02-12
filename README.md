# Quartz Wiki Wrapper (Obsidian -> Quartz -> Static Site)

This repository wraps [Quartz v4](https://quartz.jzhao.xyz/) to publish an **existing Obsidian vault** (or a vault subfolder) as a static website.

## Why Quartz As A Submodule

This project uses Quartz as a git submodule (`./quartz`) rather than vendoring Quartz source code.

- Keeps this wrapper lightweight
- Makes Quartz upgrades explicit and easy
- Avoids copying large upstream code into your wrapper repo

## How It Works (Vault -> Sync -> Quartz -> Deploy)

1. `sync-vault` reads your vault from `VAULT_PATH` and optional `VAULT_PUBLISH_SUBPATH`.
2. It copies only the publish subtree into `./quartz/content`.
3. During sync it:
   - Applies ignore patterns (for `.obsidian/`, trash, private folders, etc.)
   - Normalizes wikilinks/markdown links
   - Rewrites attachment references when possible
4. Quartz builds static output from `./quartz/content` into `./quartz/public`.
5. Deploy `./quartz/public` to GitHub Pages or Cloudflare Pages.

No Obsidian Publish is required.

## Assumptions

- `VAULT_PATH` points to your existing Obsidian vault on disk.
- `VAULT_PUBLISH_SUBPATH` is optional. If omitted, entire vault is published.
- Attachments are in folder(s) named in `attachmentsFolders` (default includes `attachments`).
- If no attachments folder is found, build still works and warns.
- `SITE_URL` and `REPO_NAME` are used to compute Quartz `baseUrl`.

## Repository Structure

```text
.
|-- .env.example
|-- .github/
|   `-- workflows/
|       `-- deploy-github-pages.yml
|-- .gitignore
|-- .gitmodules
|-- package.json
|-- README.md
|-- scripts/
|   |-- ensure-quartz-ready.mjs
|   |-- render-quartz-config.mjs
|   `-- sync-vault.mjs
|-- wrapper.config.yaml
|-- wrangler.toml
`-- quartz/            # git submodule (Quartz v4)
```

## Prerequisites

- Node.js 22 LTS (or newer)
- Git

## Initial Setup

1. Initialize Quartz submodule.
2. Install dependencies.
3. Set environment variables.

### Windows (PowerShell)

```powershell
git init
git submodule add https://github.com/jackyzha0/quartz.git quartz
npm install
$env:VAULT_PATH="D:\path\to\your\vault"
$env:VAULT_PUBLISH_SUBPATH=""   # optional
$env:SITE_URL="https://<your-user>.github.io"
$env:REPO_NAME="SK8R"
```

### macOS/Linux (bash/zsh)

```bash
git init
git submodule add https://github.com/jackyzha0/quartz.git quartz
npm install
export VAULT_PATH="/path/to/your/vault"
export VAULT_PUBLISH_SUBPATH=""   # optional
export SITE_URL="https://<your-user>.github.io"
export REPO_NAME="SK8R"
```

## Commands

- `npm run dev`: sync + patch Quartz config + local preview server
- `npm run build`: sync + patch Quartz config + static build
- `npm run refresh-build`: one-command refresh + rebuild
- `npm run sync`: only refresh content from vault

Required by design:

```bash
npm install
npm run dev
npm run build
```

`npm run dev` now forces `baseUrl=localhost` for local preview, so it works even when `REPO_NAME` is set for deployment.

## Publish Subset Configuration

Set this in either:

- env var `VAULT_PUBLISH_SUBPATH`, or
- `wrapper.config.yaml` -> `publishSubpath`

Example:

```yaml
publishSubpath: "Areas/Public"
```

This publishes only `VAULT_PATH/Areas/Public`.

## Wrapper Configuration (`wrapper.config.yaml`)

Single config file for:

- publish subpath
- ignore patterns
- attachment folder names
- optional regex link rewrite rules
- site title and description

Default example:

```yaml
publishSubpath: ""
ignorePatterns:
  - ".obsidian/**"
  - ".trash/**"
  - ".git/**"
  - "private/**"
attachmentsFolders:
  - "attachments"
linkRewriteRules: []
site:
  title: "SK8R"
  description: "Published from an Obsidian vault using Quartz"
```

## GitHub Pages Deployment (Primary)

The workflow file is:

- `.github/workflows/deploy-github-pages.yml`

It:

1. Checks out repo + submodules
2. Installs dependencies
3. Runs `npm run build`
4. Deploys `quartz/public`

### One-time GitHub setup

1. Push this repository to GitHub.
2. In repo settings:
   - `Settings -> Pages -> Build and deployment`: set source to GitHub Actions.
3. In repo settings:
   - `Settings -> Secrets and variables -> Actions -> Variables`
   - add `SITE_URL` (example: `https://<your-user>.github.io`)

### Deployment command flow (local + push)

```bash
npm run refresh-build
git add .
git commit -m "Publish vault update"
git push origin main
```

## Cloudflare Pages Deployment (Secondary)

### Option A: Cloudflare Pages UI

Use these settings:

- Framework preset: `None`
- Build command: `npm run build`
- Build output directory: `quartz/public`
- Node version: `22`

Set environment variable in Cloudflare project:

- `SITE_URL` (example: `https://wiki.example.com`)
- `REPO_NAME` (empty for apex/custom-domain root deploy, or repo name for subpath deploy)

### Option B: Wrangler (optional)

`wrangler.toml` is included with:

- `pages_build_output_dir = "quartz/public"`

Deploy via:

```bash
npm run build
npx wrangler pages deploy quartz/public --project-name <your-cloudflare-pages-project>
```

## Troubleshooting

### Broken wikilinks

- Confirm file names match link targets (including spaces/case where relevant).
- Run `npm run sync` again after renames.
- Use `linkRewriteRules` in `wrapper.config.yaml` for custom edge cases.

### Missing attachments

- Ensure attachment files exist under the publish subtree.
- Ensure folder names are listed in `attachmentsFolders`.
- If no matching attachments folder is found, sync warns but continues.

### Base URL issues (404, missing CSS/JS, wrong link roots)

- Verify `SITE_URL` and `REPO_NAME`.
- For GitHub project pages:  
  `SITE_URL=https://<user>.github.io` and `REPO_NAME=<repo>`
- For custom domain root:  
  `SITE_URL=https://wiki.example.com` and `REPO_NAME=` (empty)

### Spaces in note names

- Quartz supports note names with spaces.
- If you see failures, check for mixed link styles (`[[My Note]]` vs `[My Note](My%20Note.md)`).
- Add a targeted `linkRewriteRules` regex to normalize legacy formats.

## Notes On CI And Vault Access

CI runners cannot read your local disk vault path directly. Typical flow:

1. Run `npm run sync` locally.
2. Commit synced `quartz/content`.
3. CI builds and deploys that committed snapshot.
