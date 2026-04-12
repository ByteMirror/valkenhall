# Valkenhall — Claude Code Instructions

## Project Overview

Desktop card game arena (Flesh and Blood, Sorcery TCG) built with Electrobun + Bun + Preact. Runs on macOS, Linux, and Windows with a bundled Chromium (CEF) renderer.

## Tech Stack

- **Desktop shell:** Electrobun 1.15.1 (bundles CEF on all platforms)
- **Runtime:** Bun 1.3.6
- **UI:** Preact + Tailwind CSS + shadcn/ui
- **Proxy server:** Express on port 3001 (embedded in app)
- **Theme:** Custom medieval theme system in `src/lib/medievalTheme.jsx`

## Creating a Release

When the user asks to create a release, cut a release, ship a version, or similar:

### Pre-release checklist

1. **Ensure all changes are committed and pushed to `main`:**
   ```bash
   git status                    # must be clean (or only unrelated unstaged files)
   git log origin/main..HEAD     # must be empty (nothing unpushed)
   ```

2. **Determine the next version.** Check the latest tag:
   ```bash
   git tag --sort=-v:refname | head -1
   ```
   Bump according to semver: patch (bug fixes), minor (new features), major (breaking changes). Ask the user if unclear.

3. **Verify the renderer builds cleanly:**
   ```bash
   bun run build:renderer
   ```

4. **Run the test suite:**
   ```bash
   bun test
   ```

### Create the release

5. **Create and push the tag.** The tag format MUST be `v` followed by semver (e.g., `v0.3.0`). This triggers the CI release workflow.
   ```bash
   git tag v<VERSION>
   git push origin v<VERSION>
   ```

6. **Verify the CI workflow started:**
   ```bash
   gh run list --limit 3 --repo ByteMirror/valkenhall
   ```
   Look for a "Desktop Release" run triggered by the tag push with status `in_progress`.

7. **Optionally watch the workflow:**
   ```bash
   gh run watch <RUN_ID>
   ```

### What the CI does (no manual steps needed)

- Runs the test suite
- Builds for macOS (arm64), Linux (x64), Windows (x64) in parallel
- Injects the version from the git tag into `electrobun.config.ts` (replacing `version: '0.1.0'`)
- Generates per-platform artifacts: `update.json`, `.tar.zst` (full bundle used by the auto-updater), `.patch` (delta from previous version), and a user-facing installer — `.dmg` on macOS, `.zip` on Windows, `.run` on Linux (a self-extracting ELF binary repackaged from Electrobun's default `.tar.gz` wrapper by `scripts/build-desktop.sh`)
- Publishes all artifacts to a GitHub Release at the tag. Linux users download the `.run` file, `chmod +x`, and run it directly — no extraction step required

### After the release

- The auto-updater in existing installed apps will detect the new `update.json` on next launch and download the update automatically
- Delta patches are only generated if the CI has access to the previous version's build artifacts
- macOS code signing is skipped unless the `ELECTROBUN_DEVELOPER_ID`, `ELECTROBUN_TEAMID`, `ELECTROBUN_APPLEID`, `ELECTROBUN_APPLEIDPASS` secrets are set in the GitHub repo

### Writing release notes

When creating the tag, also create a GitHub Release with notes if the user wants. Use:
```bash
gh release create v<VERSION> --title "v<VERSION>" --notes "$(cat <<'EOF'
## What's New

- bullet points summarizing changes since last release

## Bug Fixes

- if any
EOF
)"
```

Note: The release notes body is fetched by the app's auto-updater and displayed to users in the mandatory restart modal. Keep them concise and user-facing.

## Auto-Update System

- **Main process:** `src/bun/updater.js` wraps Electrobun's `Updater` API
- **REST endpoints:** `server/proxy.js` exposes `/api/update/{status,check,retry,apply}`
- **Renderer:** `src/utils/updateManager.js` polls the status endpoint
- **UI:** `UpdateModal.jsx` (mandatory restart), `SettingsScreen.jsx` (manual controls)
- **Gate:** Users cannot start/join online games while an update is pending
- Updates are mandatory — `READY_TO_INSTALL` state shows a non-dismissible modal

## Key Architectural Decisions

- All IPC between main process and renderer goes through the Express proxy server (REST/fetch), not Electrobun's native IPC
- The updater module uses a `registerUpdateApi()` injection pattern so `proxy.js` doesn't import `electrobun/bun` (which would fail when proxy runs standalone)
- CEF (Chromium) is bundled on all platforms — the app does NOT use native WebKit/Safari or system WebView
- Class components (not hooks) — the codebase uses Preact class components throughout

## Development

```bash
bun install
bun run desktop:dev    # builds renderer + launches Electrobun
```

Stop any standalone `bun run dev` before launching desktop to avoid port 3001 conflicts.
