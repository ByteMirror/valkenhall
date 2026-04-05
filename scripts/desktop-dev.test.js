import path from 'node:path';
import { describe, expect, it } from 'bun:test';
import { getElectrobunBuildSpec, shouldIgnoreWatchPath } from './desktop-dev.js';

describe('desktop dev script helpers', () => {
  it('builds electrobun through the packaged bootstrap script instead of the .bin shim', () => {
    const projectRoot = '/tmp/fab-builder';
    const spec = getElectrobunBuildSpec(projectRoot);

    expect(spec.command).toBe(process.execPath);
    expect(spec.args[0]).toBe(path.join(projectRoot, 'node_modules', 'electrobun', 'bin', 'electrobun.cjs'));
    expect(spec.args.slice(1)).toEqual(['build', '--env=dev']);
  });

  it('ignores generated icon and build outputs in the desktop watcher', () => {
    expect(shouldIgnoreWatchPath('/tmp/fab-builder/assets/app-icons/icon.iconset/icon_512x512@2x.png')).toBe(true);
    expect(shouldIgnoreWatchPath('/tmp/fab-builder/public/app-icon.png')).toBe(true);
    expect(shouldIgnoreWatchPath('/tmp/fab-builder/build/dev-macos-arm64/fab-builder-dev.app')).toBe(true);
    expect(shouldIgnoreWatchPath('/tmp/fab-builder/node_modules/electrobun')).toBe(true);
    expect(shouldIgnoreWatchPath('/tmp/fab-builder/assets/app-icons/source/arsenal-app-icon.svg')).toBe(false);
    expect(shouldIgnoreWatchPath('/tmp/fab-builder/src/bun/index.js')).toBe(false);
  });
});
