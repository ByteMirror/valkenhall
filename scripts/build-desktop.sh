#!/usr/bin/env bash
#
# Wrapper around `electrobun build` that works around Electrobun's Zig-based
# self-extractor not supporting symlinks in tar archives (TarUnsupportedFileType).
#
# On Linux the CEF build output contains symlinks (bin/libcef.so -> cef/libcef.so,
# etc.). This script interposes a tar wrapper that adds -h (dereference symlinks)
# to tar create operations so the archive contains real file copies instead.
#
# Usage:
#   scripts/build-desktop.sh [electrobun build args...]
#   scripts/build-desktop.sh --env=stable
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

setup_tar_wrapper() {
  # Only needed on Linux — macOS uses a different bundle format and Windows uses zip.
  if [[ "$(uname -s)" != "Linux" ]]; then
    return 0
  fi

  # Resolve the real tar binary BEFORE we shadow it on PATH.
  REAL_TAR="$(command -v tar)"

  TAR_WRAPPER_DIR="$(mktemp -d)"
  trap 'rm -rf "$TAR_WRAPPER_DIR"' EXIT

  cat > "$TAR_WRAPPER_DIR/tar" << WRAPPER
#!/usr/bin/env bash
# Electrobun's Zig extractor only handles plain USTAR entries. We need:
#   -h                  turn symlinks into references to their target inode
#   --hard-dereference  turn those (and any hardlinks) into full copies
#   --format=ustar      avoid GNU 'L'/'K' long-name records and PAX 'x' headers
#                       (fails if any path > 255 bytes — we're well under)
for arg in "\$@"; do
  case "\$arg" in
    --*) continue ;;
    -*c*|c*) exec "$REAL_TAR" -h --hard-dereference --format=ustar "\$@" ;;
  esac
done
exec "$REAL_TAR" "\$@"
WRAPPER

  chmod +x "$TAR_WRAPPER_DIR/tar"
  export PATH="$TAR_WRAPPER_DIR:$PATH"
}

setup_tar_wrapper

cd "$PROJECT_ROOT"
exec bunx electrobun build "$@"
