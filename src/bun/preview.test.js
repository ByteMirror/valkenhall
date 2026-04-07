import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { APP_BASE_PATH } from './runtime.js';
import { startPreviewServers } from './preview.js';

const createdDirs = [];
const cleanupCallbacks = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fab-builder-preview-test-'));
  createdDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.allSettled(cleanupCallbacks.splice(0).map((callback) => callback()));
  await Promise.all(createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('preview runtime', () => {
  it('starts a single unified http server for renderer and local api routes', async () => {
    const distDir = await makeTempDir();
    await fs.writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>Preview</title>', 'utf8');

    const previewServers = await startPreviewServers({
      distDir,
      host: '127.0.0.1',
      rendererPort: 0,
    });

    cleanupCallbacks.push(() => previewServers.stop());

    expect(previewServers.url).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:\\d+${APP_BASE_PATH}$`));
    expect(previewServers.rendererPort).toBeGreaterThan(0);
    expect(previewServers.rendererServer).toBeTruthy();
    expect(typeof previewServers.rendererServer.stop).toBe('function');
    expect(previewServers.rendererServer.port).toBe(previewServers.rendererPort);
  });
});
