#!/usr/bin/env bash
#
# Wrapper around `electrobun build` with three Linux-specific workarounds:
#
#   1. setup_tar_wrapper     — Electrobun's Zig-based self-extractor only
#                              handles plain USTAR entries, so we interpose
#                              a tar wrapper that adds -h, --hard-dereference,
#                              and --format=ustar to any tar create operation.
#   2. patch_wmclass         — Electrobun's libNativeWrapper{,_cef}.so hardcode
#                              "ElectrobunKitchenSink-dev" as the GTK WM_CLASS.
#                              We binary-patch it to "Valkenhall" so taskbars
#                              match our StartupWMClass.
#   3. repackage_linux_inst  — Electrobun ships the self-extracting installer
#                              inside a Valkenhall-Setup.tar.gz alongside a
#                              README. We unwrap it so the release artifact is
#                              a single executable users can download and run.
#
# Usage:
#   scripts/build-desktop.sh [electrobun build args...]
#   scripts/build-desktop.sh --env=stable
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CLEANUP_DIRS=()
cleanup() {
  local d
  for d in "${CLEANUP_DIRS[@]:-}"; do
    [[ -n "${d:-}" && -d "$d" ]] && rm -rf "$d"
  done
}
trap cleanup EXIT

setup_tar_wrapper() {
  if [[ "$(uname -s)" != "Linux" ]]; then
    return 0
  fi

  # Resolve the real tar binary BEFORE we shadow it on PATH.
  REAL_TAR="$(command -v tar)"

  TAR_WRAPPER_DIR="$(mktemp -d)"
  CLEANUP_DIRS+=("$TAR_WRAPPER_DIR")

  cat > "$TAR_WRAPPER_DIR/tar" << WRAPPER
#!/usr/bin/env bash
# Flags we add to tar create operations:
#   -h, --hard-dereference    drop symlinks/hardlinks (Zig extractor can't
#                             parse those entry types)
#   --format=ustar            suppress GNU 'L'/'K' long-name records and PAX
#                             'x' headers (also unsupported by the extractor)
#   --warning=no-file-changed tolerate harmless mtime-bumps on the staging
#                             dir during Electrobun's outer tar.gz create
for arg in "\$@"; do
  case "\$arg" in
    --*) continue ;;
    -*c*|c*)
      exec "$REAL_TAR" \\
        -h --hard-dereference --format=ustar --warning=no-file-changed "\$@"
      ;;
  esac
done
exec "$REAL_TAR" "\$@"
WRAPPER

  chmod +x "$TAR_WRAPPER_DIR/tar"
  export PATH="$TAR_WRAPPER_DIR:$PATH"
}

patch_wmclass() {
  if [[ "$(uname -s)" != "Linux" ]]; then
    return 0
  fi
  bun "$SCRIPT_DIR/patch-electrobun-wmclass.js"
}

repackage_linux_installer() {
  # Replace artifacts/<prefix>-Valkenhall-Setup.tar.gz (which contains
  # installer + README.txt) with the raw self-extracting `installer` binary
  # renamed to <prefix>-Valkenhall.run so a single file can be downloaded
  # from the GitHub release and executed directly.
  if [[ "$(uname -s)" != "Linux" ]]; then
    return 0
  fi

  local artifacts_dir="$PROJECT_ROOT/artifacts"
  if [[ ! -d "$artifacts_dir" ]]; then
    echo "[repackage] no artifacts/ directory; skipping"
    return 0
  fi

  local tgz=""
  local f
  for f in "$artifacts_dir"/*-Valkenhall-Setup.tar.gz; do
    [[ -f "$f" ]] || continue
    tgz="$f"
    break
  done
  if [[ -z "$tgz" ]]; then
    echo "[repackage] no *-Valkenhall-Setup.tar.gz in $artifacts_dir; nothing to repackage"
    return 0
  fi

  local base prefix target
  base="$(basename "$tgz")"
  prefix="${base%-Valkenhall-Setup.tar.gz}"
  target="$artifacts_dir/${prefix}-Valkenhall.run"

  local tmpdir
  tmpdir="$(mktemp -d)"
  CLEANUP_DIRS+=("$tmpdir")

  # Use the real tar for extraction — our wrapper is a no-op for -x anyway,
  # but call it explicitly to make the intent obvious.
  "${REAL_TAR:-tar}" -xzf "$tgz" -C "$tmpdir"

  if [[ ! -f "$tmpdir/installer" ]]; then
    echo "[repackage] ERROR: installer binary not found inside $tgz" >&2
    return 1
  fi

  # Wrap the raw ELF in a shell script that also invokes the launcher in
  # setup-only mode after extraction, so the application menu entry +
  # uninstall script are written at install time (not at first launch).
  bun "$SCRIPT_DIR/wrap-linux-installer.js" "$tmpdir/installer" "$target"
  rm -f "$tgz"

  local size_mb
  size_mb="$(( $(stat -c %s "$target") / 1024 / 1024 ))"
  echo "[repackage] wrote $target (${size_mb} MB)"
}

setup_tar_wrapper
patch_wmclass

cd "$PROJECT_ROOT"
# Electrobun build may exit non-zero when delta patch generation fails
# (e.g. previous version not available). The full build artifacts (dmg,
# tar.zst, update.json) are still produced, so we tolerate the error and
# verify the artifacts directory exists afterwards.
bunx electrobun build "$@" || {
  echo "[build] electrobun build exited with $?, checking for artifacts..."
  if [[ -d "$PROJECT_ROOT/artifacts" ]] && ls "$PROJECT_ROOT/artifacts"/* >/dev/null 2>&1; then
    echo "[build] artifacts found — continuing despite non-zero exit"
  else
    echo "[build] no artifacts found — build truly failed"
    exit 1
  fi
}

repackage_linux_installer
