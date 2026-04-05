import fs from 'node:fs/promises';
import http from 'node:http';
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

function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

afterEach(async () => {
  await Promise.allSettled(cleanupCallbacks.splice(0).map((callback) => callback()));
  await Promise.all(createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function fetchStatus(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode || 0);
    });

    request.on('error', reject);
  });
}

describe('preview runtime', () => {
  it('starts the local proxy alongside the renderer preview server', async () => {
    const distDir = await makeTempDir();
    await fs.writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>Preview</title>', 'utf8');

    const previewServers = await startPreviewServers({
      distDir,
      host: '127.0.0.1',
      rendererPort: 0,
      proxyPort: 0,
    });

    cleanupCallbacks.push(() => previewServers.stop());

    expect(previewServers.url).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:\\d+${APP_BASE_PATH}$`));
    expect(previewServers.rendererPort).toBeGreaterThan(0);
    expect(await fetchStatus(`http://127.0.0.1:${previewServers.proxyPort}/api/cards`)).toBe(200);
  });
});
