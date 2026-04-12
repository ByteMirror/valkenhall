#!/usr/bin/env bun
// Electrobun's libNativeWrapper{,_cef}.so hardcode the string
// "ElectrobunKitchenSink-dev" and pass it to gtk_window_set_wmclass() on
// every top-level window. This leaks their Kitchen Sink example app's
// class into every downstream Electrobun app, so Linux taskbars/task
// switchers can't match the running window to our .desktop entry
// (StartupWMClass=Valkenhall), and the app gets a placeholder icon in a
// second taskbar slot.
//
// Fix: binary-patch both shared libraries before `electrobun build` copies
// them into the app bundle. Overwrite `ElectrobunKitchenSink-dev\0` with
// `Valkenhall\0` followed by null bytes to preserve the original length.
// C null-terminated string semantics make the trailing padding inert.
//
// Idempotent: if the marker is already gone (re-runs, or an Electrobun
// release that fixes this upstream), the script logs and exits cleanly.
// Runs from scripts/build-desktop.sh pre-build on Linux only.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLD = 'ElectrobunKitchenSink-dev';
const NEW = 'Valkenhall';

if (NEW.length > OLD.length) {
  throw new Error(`replacement "${NEW}" longer than original "${OLD}"`);
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  'node_modules/electrobun/dist-linux-x64/libNativeWrapper.so',
  'node_modules/electrobun/dist-linux-x64/libNativeWrapper_cef.so',
];

const needle = Buffer.concat([Buffer.from(OLD, 'utf8'), Buffer.from([0])]);
const replacement = Buffer.alloc(needle.length); // zero-filled
replacement.write(NEW, 0, 'utf8');

let totalPatched = 0;
let filesTouched = 0;
for (const rel of targets) {
  const abs = path.join(projectRoot, rel);
  let bytes;
  try {
    bytes = readFileSync(abs);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`[patch-wmclass] skipping ${rel} (not found)`);
      continue;
    }
    throw err;
  }

  let count = 0;
  let cursor = 0;
  while (true) {
    const idx = bytes.indexOf(needle, cursor);
    if (idx === -1) break;
    replacement.copy(bytes, idx);
    count += 1;
    cursor = idx + needle.length;
  }

  if (count > 0) {
    writeFileSync(abs, bytes);
    console.log(`[patch-wmclass] ${rel}: patched ${count}`);
    totalPatched += count;
    filesTouched += 1;
  } else {
    console.log(`[patch-wmclass] ${rel}: already clean`);
  }
}

console.log(
  `[patch-wmclass] done (${totalPatched} occurrence(s) across ${filesTouched} file(s))`,
);
