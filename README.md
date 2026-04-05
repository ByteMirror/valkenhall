# flesh-and-blood-proxies

Welcome to my flesh and blood proxy generator.

Bun now handles the package management, runtime, frontend dev server, frontend build, and test runner for this project.

## Getting started

Install dependencies and start the app with:

```bash
bun install
bun run dev
```

That starts the desktop shell, the built renderer preview server, and the local proxy server used for Fabrary imports.

## Common commands

```bash
bun run build
bun run preview
bun run test
```

## Desktop

Electrobun can run the project as a desktop shell while reusing the same Bun renderer.

```bash
bun run desktop:dev
```

```bash
bun run desktop:build
```

- `desktop:dev` builds the renderer, serves the built preview bundle on `127.0.0.1:4173`, and launches Electrobun against that preview server.
- The Electrobun main process owns the local Fabrary/upscale proxy on port `3001`.
- Stop any existing `bun run dev` session before launching the desktop app to avoid a port conflict on `3001`.
- Desktop builds bundle `server/upscaling` into the app resources. `desktop:dev`, `desktop:build`, and the release workflow now bootstrap the current platform binary from the official Upscayl release archive when it is missing.
- The extracted per-platform binaries live at:
  - `server/upscaling/bin/darwin-arm64/upscayl-bin`
  - `server/upscaling/bin/linux-x64/upscayl-bin`
  - `server/upscaling/bin/win32-x64/upscayl-bin.exe`
- The proxy only falls back to the legacy `server/upscaling/upscayl-bin` path on Linux, and supports `FAB_BUILDER_UPSCAYL_BIN` / `FAB_BUILDER_UPSCAYL_MODELS_DIR` overrides.

## Releases

- Tagging `v*` now runs `.github/workflows/desktop-release.yml` to build native desktop artifacts on macOS, Linux, and Windows.
- Each matrix build validates the required bundled upscaling binary and model files before packaging.
- Tagged builds upload per-OS archives to the GitHub Release page.

## Runtime notes

- Bun `1.3.6` is the expected package manager version for this repo.
