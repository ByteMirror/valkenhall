import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  chmodSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  ensureLinuxDesktopEntry,
  resolveBundleLayout,
  buildDesktopEntry,
  renderUninstallScript,
  buildUninstallDesktopEntry,
  ensureUninstallScript,
} from './linuxDesktopEntry.js';

function makeBundleFixture(root, channel = 'stable') {
  const appDir = path.join(root, channel, 'app');
  const binDir = path.join(appDir, 'bin');
  const resourcesDir = path.join(appDir, 'Resources');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(resourcesDir, { recursive: true });
  const launcherPath = path.join(binDir, 'launcher');
  writeFileSync(launcherPath, '#!/bin/sh\nexit 0\n');
  chmodSync(launcherPath, 0o755);
  // Realistic layout: the Electrobun launcher spawns bin/bun at runtime,
  // so process.execPath inside the Bun main process is bin/bun (not the
  // launcher).
  const bunPath = path.join(binDir, 'bun');
  writeFileSync(bunPath, '#!/bin/sh\nexit 0\n');
  chmodSync(bunPath, 0o755);
  const iconPath = path.join(resourcesDir, 'appIcon.png');
  writeFileSync(iconPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return { appDir, launcherPath, bunPath, iconPath };
}

let scratch;
let xdgDataHome;
let fakeHome;

beforeEach(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'valk-desktop-'));
  xdgDataHome = path.join(scratch, 'xdg');
  fakeHome = path.join(scratch, 'home');
  mkdirSync(xdgDataHome, { recursive: true });
  mkdirSync(fakeHome, { recursive: true });
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('ensureLinuxDesktopEntry', () => {
  it('is a no-op on non-Linux platforms', () => {
    const wrote = ensureLinuxDesktopEntry({
      platform: 'darwin',
      env: { XDG_DATA_HOME: xdgDataHome },
      execPath: '/nonexistent/bin/launcher',
    });
    expect(wrote).toBe(false);
    expect(existsSync(path.join(xdgDataHome, 'applications'))).toBe(false);
  });

  it('writes a valid desktop entry on first call', () => {
    const { launcherPath, iconPath } = makeBundleFixture(scratch, 'stable');

    const wrote = ensureLinuxDesktopEntry({
      platform: 'linux',
      execPath: launcherPath,
      env: { XDG_DATA_HOME: xdgDataHome },
    });

    expect(wrote).toBe(true);
    const target = path.join(
      xdgDataHome,
      'applications',
      'dev.fabianurbanek.valkenhall.stable.desktop',
    );
    expect(existsSync(target)).toBe(true);

    const contents = readFileSync(target, 'utf8');
    expect(contents).toContain('[Desktop Entry]');
    expect(contents).toContain('Type=Application');
    expect(contents).toContain('Name=Valkenhall\n');
    expect(contents).toContain(`Exec=${launcherPath} %U`);
    expect(contents).toContain(`TryExec=${launcherPath}`);
    expect(contents).toContain(`Icon=${iconPath}`);
    expect(contents).toContain('Categories=Game;CardGame;');
    expect(contents).toContain('StartupWMClass=Valkenhall');
    expect(contents).toContain('X-Valkenhall-Channel=stable');

    for (const line of contents.split('\n')) {
      if (
        line.startsWith('Exec=') ||
        line.startsWith('TryExec=') ||
        line.startsWith('Icon=')
      ) {
        const value = line.slice(line.indexOf('=') + 1).replace(/ %U$/, '');
        expect(path.isAbsolute(value)).toBe(true);
      }
    }
  });

  it('is idempotent on a second call with the same inputs', () => {
    const { launcherPath } = makeBundleFixture(scratch, 'stable');
    const args = {
      platform: 'linux',
      execPath: launcherPath,
      env: { XDG_DATA_HOME: xdgDataHome },
    };

    expect(ensureLinuxDesktopEntry(args)).toBe(true);
    expect(ensureLinuxDesktopEntry(args)).toBe(false);

    const target = path.join(
      xdgDataHome,
      'applications',
      'dev.fabianurbanek.valkenhall.stable.desktop',
    );
    const first = readFileSync(target, 'utf8');
    expect(ensureLinuxDesktopEntry(args)).toBe(false);
    expect(readFileSync(target, 'utf8')).toBe(first);
  });

  it('rewrites when the existing Exec line points to a different install', () => {
    const { launcherPath } = makeBundleFixture(scratch, 'stable');
    const target = path.join(
      xdgDataHome,
      'applications',
      'dev.fabianurbanek.valkenhall.stable.desktop',
    );
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(
      target,
      '[Desktop Entry]\nType=Application\nName=Valkenhall\nExec=/old/path/launcher %U\n',
    );

    const wrote = ensureLinuxDesktopEntry({
      platform: 'linux',
      execPath: launcherPath,
      env: { XDG_DATA_HOME: xdgDataHome },
    });

    expect(wrote).toBe(true);
    const contents = readFileSync(target, 'utf8');
    expect(contents).toContain(`Exec=${launcherPath} %U`);
    expect(contents).not.toContain('/old/path/launcher');
  });

  it('uses a channel-suffixed filename and display name for non-stable channels', () => {
    const { launcherPath } = makeBundleFixture(scratch, 'canary');

    ensureLinuxDesktopEntry({
      platform: 'linux',
      execPath: launcherPath,
      env: { XDG_DATA_HOME: xdgDataHome },
    });

    const target = path.join(
      xdgDataHome,
      'applications',
      'dev.fabianurbanek.valkenhall.canary.desktop',
    );
    const contents = readFileSync(target, 'utf8');
    expect(contents).toContain('Name=Valkenhall (canary)');
    expect(contents).toContain('X-Valkenhall-Channel=canary');
  });

  it('falls back to $HOME/.local/share when XDG_DATA_HOME is unset', () => {
    const { launcherPath } = makeBundleFixture(scratch, 'stable');

    ensureLinuxDesktopEntry({
      platform: 'linux',
      execPath: launcherPath,
      env: {},
      homedir: () => fakeHome,
    });

    const target = path.join(
      fakeHome,
      '.local',
      'share',
      'applications',
      'dev.fabianurbanek.valkenhall.stable.desktop',
    );
    expect(existsSync(target)).toBe(true);
  });

  it('bails out when the execPath does not point to a real launcher (dev mode)', () => {
    const wrote = ensureLinuxDesktopEntry({
      platform: 'linux',
      execPath: '/nonexistent/bin/launcher',
      env: { XDG_DATA_HOME: xdgDataHome },
    });
    expect(wrote).toBe(false);
    expect(existsSync(path.join(xdgDataHome, 'applications'))).toBe(false);
  });

  it('does not throw on a read-only applications directory', () => {
    const { launcherPath } = makeBundleFixture(scratch, 'stable');
    const appsDir = path.join(xdgDataHome, 'applications');
    mkdirSync(appsDir, { recursive: true });
    chmodSync(appsDir, 0o500);

    try {
      const wrote = ensureLinuxDesktopEntry({
        platform: 'linux',
        execPath: launcherPath,
        env: { XDG_DATA_HOME: xdgDataHome },
      });
      expect(typeof wrote).toBe('boolean');
    } finally {
      chmodSync(appsDir, 0o700);
    }
  });

  it('uses bin/launcher in Exec even when execPath is bin/bun', () => {
    // This mirrors the real runtime: the launcher spawns bin/bun, so
    // process.execPath is bin/bun. The menu entry must still point at
    // the launcher so LD_PRELOAD gets set up before CEF loads.
    const { launcherPath, bunPath } = makeBundleFixture(scratch, 'stable');

    ensureLinuxDesktopEntry({
      platform: 'linux',
      execPath: bunPath,
      env: { XDG_DATA_HOME: xdgDataHome },
    });

    const target = path.join(
      xdgDataHome,
      'applications',
      'dev.fabianurbanek.valkenhall.stable.desktop',
    );
    const contents = readFileSync(target, 'utf8');
    expect(contents).toContain(`Exec=${launcherPath} %U`);
    expect(contents).toContain(`TryExec=${launcherPath}`);
    expect(contents).not.toContain(bunPath);
  });

  it('does not rewrite the file on a clean second launch (mtime stable)', () => {
    const { launcherPath } = makeBundleFixture(scratch, 'stable');
    const args = {
      platform: 'linux',
      execPath: launcherPath,
      env: { XDG_DATA_HOME: xdgDataHome },
    };
    ensureLinuxDesktopEntry(args);
    const target = path.join(
      xdgDataHome,
      'applications',
      'dev.fabianurbanek.valkenhall.stable.desktop',
    );
    const firstMtime = statSync(target).mtimeMs;
    // Wait a hair to ensure any rewrite would be detectable.
    const end = Date.now() + 20;
    while (Date.now() < end) { /* spin */ }
    ensureLinuxDesktopEntry(args);
    expect(statSync(target).mtimeMs).toBe(firstMtime);
  });
});

describe('resolveBundleLayout', () => {
  it('derives channel from the grandparent directory and always points launcherPath at bin/launcher', () => {
    const { bunPath, launcherPath } = makeBundleFixture(scratch, 'stable');
    // Pass bin/bun as execPath — matches what process.execPath returns at runtime.
    const layout = resolveBundleLayout({ execPath: bunPath });
    expect(layout.channel).toBe('stable');
    expect(layout.launcherPath).toBe(launcherPath);
    expect(layout.bundleRoot.endsWith(path.join('stable', 'app'))).toBe(true);
    expect(
      layout.iconPath.endsWith(path.join('app', 'Resources', 'appIcon.png')),
    ).toBe(true);
  });

  it('returns null for a non-bundle-shaped execPath', () => {
    expect(resolveBundleLayout({ execPath: '/usr/bin/bun' })).toBe(null);
  });
});

describe('uninstall integration', () => {
  it('writes an uninstall script to <channelDir>/uninstall.sh on first launch', () => {
    const { launcherPath } = makeBundleFixture(scratch, 'stable');

    ensureLinuxDesktopEntry({
      platform: 'linux',
      execPath: launcherPath,
      env: { XDG_DATA_HOME: xdgDataHome },
    });

    const scriptPath = path.join(scratch, 'stable', 'uninstall.sh');
    expect(existsSync(scriptPath)).toBe(true);
    const mode = statSync(scriptPath).mode & 0o777;
    expect(mode).toBe(0o755);
    const contents = readFileSync(scriptPath, 'utf8');
    expect(contents).toMatch(/^#!\/usr\/bin\/env bash/);
    expect(contents).toContain('ID="dev.fabianurbanek.valkenhall"');
    expect(contents).toContain('CHANNEL="stable"');
  });

  it('writes an uninstall .desktop entry pointing at the uninstall script', () => {
    const { launcherPath } = makeBundleFixture(scratch, 'stable');

    ensureLinuxDesktopEntry({
      platform: 'linux',
      execPath: launcherPath,
      env: { XDG_DATA_HOME: xdgDataHome },
    });

    const scriptPath = path.join(scratch, 'stable', 'uninstall.sh');
    const target = path.join(
      xdgDataHome,
      'applications',
      'dev.fabianurbanek.valkenhall.stable.uninstall.desktop',
    );
    expect(existsSync(target)).toBe(true);
    const contents = readFileSync(target, 'utf8');
    expect(contents).toContain('Name=Uninstall Valkenhall\n');
    expect(contents).toContain(`Exec=${scriptPath}`);
    expect(contents).toContain(`TryExec=${scriptPath}`);
    expect(contents).toContain('Terminal=true');
    expect(contents).toContain('Categories=System;');
  });

  it('uses a channel-suffixed uninstall display name for non-stable channels', () => {
    const { launcherPath } = makeBundleFixture(scratch, 'canary');

    ensureLinuxDesktopEntry({
      platform: 'linux',
      execPath: launcherPath,
      env: { XDG_DATA_HOME: xdgDataHome },
    });

    const target = path.join(
      xdgDataHome,
      'applications',
      'dev.fabianurbanek.valkenhall.canary.uninstall.desktop',
    );
    const contents = readFileSync(target, 'utf8');
    expect(contents).toContain('Name=Uninstall Valkenhall (canary)');
  });

  it('is idempotent: second call does not rewrite the uninstall script or entry', () => {
    const { launcherPath } = makeBundleFixture(scratch, 'stable');
    const args = {
      platform: 'linux',
      execPath: launcherPath,
      env: { XDG_DATA_HOME: xdgDataHome },
    };

    ensureLinuxDesktopEntry(args);

    const scriptPath = path.join(scratch, 'stable', 'uninstall.sh');
    const entryPath = path.join(
      xdgDataHome,
      'applications',
      'dev.fabianurbanek.valkenhall.stable.uninstall.desktop',
    );
    const scriptMtime = statSync(scriptPath).mtimeMs;
    const entryMtime = statSync(entryPath).mtimeMs;

    const end = Date.now() + 20;
    while (Date.now() < end) { /* spin */ }

    ensureLinuxDesktopEntry(args);
    expect(statSync(scriptPath).mtimeMs).toBe(scriptMtime);
    expect(statSync(entryPath).mtimeMs).toBe(entryMtime);
  });

  it('rewrites the uninstall entry when the script path drifts', () => {
    const { launcherPath } = makeBundleFixture(scratch, 'stable');
    const entryPath = path.join(
      xdgDataHome,
      'applications',
      'dev.fabianurbanek.valkenhall.stable.uninstall.desktop',
    );
    mkdirSync(path.dirname(entryPath), { recursive: true });
    writeFileSync(
      entryPath,
      '[Desktop Entry]\nType=Application\nName=Uninstall Valkenhall\nExec=/old/path/uninstall.sh\n',
    );

    ensureLinuxDesktopEntry({
      platform: 'linux',
      execPath: launcherPath,
      env: { XDG_DATA_HOME: xdgDataHome },
    });

    const contents = readFileSync(entryPath, 'utf8');
    expect(contents).toContain(
      `Exec=${path.join(scratch, 'stable', 'uninstall.sh')}`,
    );
    expect(contents).not.toContain('/old/path/uninstall.sh');
  });
});

describe('renderUninstallScript', () => {
  it('substitutes ID and channel placeholders', () => {
    const script = renderUninstallScript('canary');
    expect(script).toContain('ID="dev.fabianurbanek.valkenhall"');
    expect(script).toContain('CHANNEL="canary"');
    expect(script).not.toContain('__ID__');
    expect(script).not.toContain('__CHANNEL__');
  });

  it('produces bash that passes a syntax check', () => {
    // bash -n parses without executing — catches template bugs that
    // make the script unusable before any user can run it.
    const scriptPath = path.join(scratch, 'check-uninstall.sh');
    writeFileSync(scriptPath, renderUninstallScript('stable'));
    const result = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(`bash -n failed: ${result.stderr}`);
    }
    expect(result.status).toBe(0);
  });
});

describe('buildUninstallDesktopEntry', () => {
  it('marks the entry as Terminal=true and Categories=System;', () => {
    const body = buildUninstallDesktopEntry({
      iconPath: '/x/app/Resources/appIcon.png',
      channel: 'stable',
      scriptPath: '/x/stable/uninstall.sh',
    });
    expect(body).toContain('Terminal=true');
    expect(body).toContain('Categories=System;');
    expect(body).toContain('Exec=/x/stable/uninstall.sh');
  });
});

describe('ensureUninstallScript', () => {
  it('is idempotent when contents match', () => {
    const channelDir = path.join(scratch, 'stable');
    const first = ensureUninstallScript(channelDir, 'stable');
    const mtime1 = statSync(first).mtimeMs;
    const end = Date.now() + 20;
    while (Date.now() < end) { /* spin */ }
    const second = ensureUninstallScript(channelDir, 'stable');
    expect(second).toBe(first);
    expect(statSync(first).mtimeMs).toBe(mtime1);
  });

  it('rewrites when channel changes', () => {
    const channelDir = path.join(scratch, 'stable');
    ensureUninstallScript(channelDir, 'stable');
    const firstContents = readFileSync(path.join(channelDir, 'uninstall.sh'), 'utf8');
    // Re-render with a different channel — should overwrite.
    writeFileSync(
      path.join(channelDir, 'uninstall.sh'),
      firstContents.replace('CHANNEL="stable"', 'CHANNEL="canary"'),
    );
    ensureUninstallScript(channelDir, 'stable');
    const restored = readFileSync(path.join(channelDir, 'uninstall.sh'), 'utf8');
    expect(restored).toContain('CHANNEL="stable"');
  });
});

describe('buildDesktopEntry', () => {
  it('quotes Exec values that contain spaces', () => {
    const body = buildDesktopEntry({
      launcherPath: '/home/luis maría/app/bin/launcher',
      iconPath: '/home/luis maría/app/Resources/appIcon.png',
      channel: 'stable',
    });
    expect(body).toContain('Exec="/home/luis maría/app/bin/launcher" %U');
    expect(body).toContain('TryExec=/home/luis maría/app/bin/launcher');
  });

  it('uses display name with channel suffix for non-stable channels', () => {
    const body = buildDesktopEntry({
      launcherPath: '/x/app/bin/launcher',
      iconPath: '/x/app/Resources/appIcon.png',
      channel: 'canary',
    });
    expect(body).toContain('Name=Valkenhall (canary)');
    expect(body).toContain('X-Valkenhall-Channel=canary');
  });
});
