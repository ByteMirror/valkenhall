# Valkenhall

A desktop card game arena built with Electrobun, Bun, and Preact. Play Sorcery TCG with deck building, ranked matchmaking, collection management, and a 3D game board.

Runs natively on macOS, Linux, and Windows.

## Getting Started

```bash
bun install
npm run dev
```

This starts the full desktop development environment:

| Service | URL | Description |
|---------|-----|-------------|
| Renderer | `http://127.0.0.1:4173` | Built app served locally (also opens in Electrobun desktop window) |
| Proxy API | `http://127.0.0.1:3001` | Local API for deck storage, card data, auth token persistence |

The renderer auto-rebuilds when files in `src/` change. The Electrobun desktop shell rebuilds when `src/bun/`, `server/proxy.js`, or `electrobun.config.ts` change.

**Prerequisites:** [Bun](https://bun.sh/) 1.3+

## Commands

| Command | Description |
|---------|-------------|
| `bun run desktop:dev` | Launch the desktop app in development mode |
| `bun run desktop:build` | Build a production desktop bundle |
| `bun run build` | Build the web renderer (icons, cards, clean, compile) |
| `bun run build:renderer` | Build only the web renderer |
| `bun run test` | Run the test suite |
| `bun run update-cards` | Download the latest card database |

## Architecture

```
src/
  bun/           Main process (Electrobun/Bun)
    index.js       Entry point — windows, menus, proxy, updater
    updater.js     Auto-update manager (wraps Electrobun Updater)
    menu.js        Application menu
    lifecycle.js   Process cleanup
    runtime.js     Renderer server
  components/    Preact UI components
  utils/         Shared utilities
  lib/           Theme system, UI primitives
  app.jsx        Main application component
server/
  proxy.js       Express API server (port 3001) — decks, cards, sessions, updates
```

**Main process** (Bun) manages windows, the proxy server, and the auto-updater. **Renderer** (Preact + Tailwind + shadcn/ui) handles all UI. Communication between them is via REST endpoints on the proxy server.

## Auto-Updates

The app uses Electrobun's built-in updater with differential patching. Updates are mandatory — players must be on the same version for online play.

**How it works:**

1. On launch, the app checks for updates via `update.json` hosted on GitHub Releases
2. If an update is available, it downloads automatically in the background (delta patches are typically ~14KB)
3. Users can browse menus and decks during download, but cannot start or join games
4. Once downloaded, a non-dismissible modal prompts the user to restart
5. The app quits, applies the update, and relaunches on the new version

**User-facing controls:**

- **Settings > Updates** — shows current version, update status, manual check button, and release notes
- **Toast notification** — appears when an update finishes downloading
- **Badge on Settings button** — gold dot when update is pending, red when download failed

**Configuration:**

The update endpoint is configured in `electrobun.config.ts`:

```typescript
release: {
  baseUrl: 'https://github.com/ByteMirror/valkenhall/releases/latest/download',
}
```

## Releases

Pushing a `v*` tag triggers the CI release workflow (`.github/workflows/desktop-release.yml`):

1. **Test** — runs the test suite on Ubuntu
2. **Build** — builds for macOS (arm64), Linux (x64), and Windows (x64) in parallel
   - Injects the version from the git tag into `electrobun.config.ts`
   - Generates Electrobun artifacts: `update.json`, `.tar.zst` (full bundle), `.patch` (delta), and platform installers
3. **Publish** — uploads all artifacts to the GitHub Release

**Creating a release:**

```bash
git tag v0.3.0
git push origin v0.3.0
```

The first release after enabling the update system (`v0.2.0`) only has full downloads. Subsequent releases generate delta patches from the previous version automatically.

**Code signing:** macOS code signing and notarization are supported via environment variables (`ELECTROBUN_DEVELOPER_ID`, `ELECTROBUN_TEAMID`, `ELECTROBUN_APPLEID`, `ELECTROBUN_APPLEIDPASS`). Add these as GitHub Actions secrets when an Apple Developer account is available. Without them, builds are unsigned and macOS users will need to bypass Gatekeeper.

## Desktop Build Details

- Electrobun bundles the Chromium Embedded Framework (CEF) for rendering
- The proxy server (`server/proxy.js`) runs embedded in the app on port 3001
- Upscaling binaries are bundled per-platform from `server/upscaling/bin/{platform}/`
- Dev and release builds bootstrap the upscaling binary from the official Upscayl archive when missing
- Stop any standalone `bun run dev` session before launching the desktop app to avoid port conflicts on 3001
