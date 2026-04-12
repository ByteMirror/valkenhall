import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const APP_ID = 'dev.fabianurbanek.valkenhall';
const APP_NAME = 'Valkenhall';
const DESKTOP_ENTRY_SPEC_VERSION = '1.5';

export function ensureLinuxDesktopEntry(overrides = {}) {
  if ((overrides.platform || process.platform) !== 'linux') {
    return false;
  }
  try {
    const layout = resolveBundleLayout(overrides);
    if (!layout) return false;

    const targetDir = resolveApplicationsDir(overrides);
    if (!targetDir) return false;

    const contents = buildDesktopEntry(layout);
    const filename = `${APP_ID}.${layout.channel}.desktop`;
    const targetPath = path.join(targetDir, filename);

    if (!needsWrite(targetPath, layout.launcherPath)) {
      return false;
    }

    mkdirSync(targetDir, { recursive: true });
    atomicWrite(targetPath, contents);
    refreshDesktopDatabase(targetDir);
    return true;
  } catch (err) {
    console.warn('[linuxDesktopEntry] failed:', err?.message || err);
    return false;
  }
}

// Inside an installed Electrobun Linux bundle, `process.execPath` is the
// `bin/bun` runtime that was spawned by `bin/launcher`. The launcher sets
// up LD_PRELOAD (libcef.so + libvk_swiftshader.so) before exec'ing bun, so
// menu entries MUST point at the launcher — invoking `bin/bun` directly
// bypasses LD_PRELOAD and CEF fails to initialize. We derive the bundle
// root from execPath but always use `<bundleRoot>/bin/launcher` for Exec.
export function resolveBundleLayout(overrides = {}) {
  const execPath = overrides.execPath || process.execPath;
  if (!execPath || !path.isAbsolute(execPath)) return null;

  const bundleRoot = path.resolve(execPath, '..', '..');
  if (path.basename(bundleRoot) !== 'app') return null;

  const channelDir = path.resolve(bundleRoot, '..');
  const channel = path.basename(channelDir) || 'stable';
  const launcherPath = path.join(bundleRoot, 'bin', 'launcher');
  const iconPath = path.join(bundleRoot, 'Resources', 'appIcon.png');

  if (overrides.skipFsCheck !== true) {
    try {
      if (!statSync(launcherPath).isFile()) return null;
    } catch {
      return null;
    }
  }

  return { launcherPath, bundleRoot, iconPath, channel };
}

function resolveApplicationsDir(overrides = {}) {
  const env = overrides.env || process.env;
  const home = overrides.homedir ? overrides.homedir() : os.homedir();
  const xdgDataHome = env.XDG_DATA_HOME && env.XDG_DATA_HOME.trim();
  const base = xdgDataHome && path.isAbsolute(xdgDataHome)
    ? xdgDataHome
    : home
      ? path.join(home, '.local', 'share')
      : null;
  if (!base) return null;
  return path.join(base, 'applications');
}

export function buildDesktopEntry({ launcherPath, iconPath, channel }) {
  const isStable = channel === 'stable';
  const displayName = isStable ? APP_NAME : `${APP_NAME} (${channel})`;
  const execValue = `${quoteExecArgument(launcherPath)} %U`;

  const lines = [
    '[Desktop Entry]',
    'Type=Application',
    `Version=${DESKTOP_ENTRY_SPEC_VERSION}`,
    `Name=${displayName}`,
    'GenericName=Card Game Arena',
    'Comment=Desktop arena for Flesh and Blood and Sorcery TCG',
    `Exec=${execValue}`,
    `TryExec=${launcherPath}`,
    `Icon=${iconPath}`,
    'Terminal=false',
    'Categories=Game;CardGame;',
    'StartupNotify=true',
    `StartupWMClass=${APP_NAME}`,
    `X-Valkenhall-Channel=${channel}`,
    '',
  ];
  return lines.join('\n');
}

function quoteExecArgument(arg) {
  if (!/[\s"`$\\]/.test(arg)) return arg;
  const escaped = arg.replace(/(["`$\\])/g, '\\$1');
  return `"${escaped}"`;
}

function needsWrite(targetPath, expectedLauncherPath) {
  if (!existsSync(targetPath)) return true;
  let contents;
  try {
    contents = readFileSync(targetPath, 'utf8');
  } catch {
    return true;
  }
  const match = contents.match(/^Exec=(.*)$/m);
  if (!match) return true;

  const firstArg = parseFirstExecArg(match[1]);
  return firstArg !== expectedLauncherPath;
}

function parseFirstExecArg(value) {
  const trimmed = value.trimStart();
  if (trimmed.startsWith('"')) {
    let out = '';
    let i = 1;
    while (i < trimmed.length) {
      const ch = trimmed[i];
      if (ch === '\\' && i + 1 < trimmed.length) {
        out += trimmed[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') return out;
      out += ch;
      i += 1;
    }
    return out;
  }
  const space = trimmed.indexOf(' ');
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

function atomicWrite(targetPath, contents) {
  const tmp = `${targetPath}.tmp`;
  writeFileSync(tmp, contents, { encoding: 'utf8', mode: 0o644 });
  renameSync(tmp, targetPath);
}

function refreshDesktopDatabase(applicationsDir) {
  try {
    spawnSync('update-desktop-database', [applicationsDir], {
      stdio: 'ignore',
      timeout: 2000,
    });
  } catch {
    // ignore — missing on minimal systems is fine; DEs typically watch the dir.
  }
}
