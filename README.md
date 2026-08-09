# Valkenhall — Downloads

Release artifacts for the [Valkenhall](https://valkenhall.com) desktop app.

**This repository contains no source code.** It exists so that desktop clients
installed before the move to our own CDN keep receiving automatic updates: their
update feed URL is compiled into the installed app and points here, so it cannot
be redirected after the fact.

New installs read the feed from `downloads.valkenhall.com` instead. This mirror
will be retired once the older install base has aged out.

## Downloading

Get the latest build for your platform from **[valkenhall.com](https://valkenhall.com)**,
or from the [Releases page](https://github.com/ByteMirror/valkenhall/releases/latest).

- **macOS** (Apple Silicon) — `Valkenhall-<version>-arm64.dmg`
- **Linux** (x64) — `Valkenhall-<version>-x64.AppImage`
- **Windows** (x64) — `Valkenhall-<version>-x64-Setup.exe`

## Issues

Bug reports and feature requests are handled in-app via the feedback form, which
files them against the private source repository.
