#!/usr/bin/env bun
// Wraps Electrobun's self-extracting installer ELF in a shell script
// that runs the core installer and then launches the freshly-installed
// app in the background, detached from the terminal. The Bun main
// process runs ensureLinuxDesktopEntry() on startup, so the XDG menu
// entry, uninstall script, and uninstall menu entry appear as a side
// effect of the first launch — users get both the running app AND the
// menu entries from a single click on the installer.
//
// The output file is a bash script followed by the raw ELF payload.
// bash stops executing at `exit 0`, so the trailing binary is inert to
// the shell but available for `tail -c +OFFSET` extraction.
//
// Usage:
//   bun scripts/wrap-linux-installer.js <payload> <output>

import { readFileSync, writeFileSync, chmodSync } from 'node:fs';

const [, , payloadPath, outputPath] = process.argv;
if (!payloadPath || !outputPath) {
  console.error('usage: wrap-linux-installer.js <payload> <output>');
  process.exit(1);
}

// 10 underscores — same width as a 10-digit byte offset (supports up to
// ~9.99 GB payloads, well beyond any realistic installer size). Using a
// fixed-width placeholder means substituting the real offset doesn't
// change the header length, so the offset we compute before substitution
// is still valid afterwards.
const OFFSET_PLACEHOLDER = '__________';

const headerTemplate = `#!/usr/bin/env bash
#
# Valkenhall self-extracting installer (shell-wrapped).
#
# This file is a bash script followed by an Electrobun self-extracting
# ELF payload at byte offset PAYLOAD_OFFSET. The script extracts the
# ELF, runs it, then launches the freshly-installed app in the
# background, detached from this shell. The app's main process writes
# the XDG menu entry, uninstall script, and uninstall menu entry
# immediately after it starts.
#
set -e
PAYLOAD_OFFSET=${OFFSET_PLACEHOLDER}

workdir="$(mktemp -d)"
cleanup() { rm -rf "$workdir" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

payload="$workdir/installer"
tail -c "+$((10#$PAYLOAD_OFFSET + 1))" "$0" > "$payload"
chmod +x "$payload"
"$payload"

# Launch the app, detached from this shell so it survives after the
# installer wrapper exits. nohup ignores SIGHUP (survives terminal
# close), & backgrounds it, disown removes it from the shell's job
# table. Redirecting stdin/stdout/stderr to /dev/null avoids nohup.out
# in the user's current directory and keeps the terminal clean.
data_home="\${XDG_DATA_HOME:-$HOME/.local/share}"
launcher="$data_home/dev.fabianurbanek.valkenhall/stable/app/bin/launcher"
if [ -x "$launcher" ]; then
  echo "Launching Valkenhall..."
  nohup "$launcher" </dev/null >/dev/null 2>&1 &
  disown 2>/dev/null || true
fi

exit 0
`;

if (!headerTemplate.includes(OFFSET_PLACEHOLDER)) {
  throw new Error('offset placeholder missing from template');
}

const headerBytes = Buffer.from(headerTemplate, 'utf8');
const offset = headerBytes.length;
const offsetStr = String(offset).padStart(OFFSET_PLACEHOLDER.length, '0');
if (offsetStr.length !== OFFSET_PLACEHOLDER.length) {
  throw new Error(
    `offset ${offset} exceeds ${OFFSET_PLACEHOLDER.length}-digit width`,
  );
}

const finalHeader = headerTemplate.replace(OFFSET_PLACEHOLDER, offsetStr);
if (Buffer.byteLength(finalHeader, 'utf8') !== offset) {
  throw new Error('header length changed after substitution');
}

const payloadBytes = readFileSync(payloadPath);
writeFileSync(
  outputPath,
  Buffer.concat([Buffer.from(finalHeader, 'utf8'), payloadBytes]),
);
chmodSync(outputPath, 0o755);

console.log(
  `[wrap] wrote ${outputPath} (header=${offset} bytes, payload=${payloadBytes.length} bytes)`,
);
