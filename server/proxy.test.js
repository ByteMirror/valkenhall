import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import {
  resolveAvailableUpscaylBin,
  resolveCardsJsonPath,
  resolveUpscalingAssetPaths,
  startProxyServer,
  writeFetchResponseToFile,
} from './proxy.js';

const startedServers = [];
const createdDirs = [];

afterEach(async () => {
  await Promise.all(
    startedServers.splice(0).map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        })
    )
  );
  await Promise.all(createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('proxy server', () => {
  it('resolves bundled platform-specific upscaling assets for packaged desktop builds', () => {
    const resolved = resolveUpscalingAssetPaths({
      runtimeDir: '/Applications/Fab Builder.app/Contents/Resources/app/bun',
      platform: 'darwin',
      arch: 'arm64',
    });

    expect(resolved.upscalingDir).toBe('/Applications/Fab Builder.app/Contents/Resources/app/server/upscaling');
    expect(resolved.modelsDir).toBe('/Applications/Fab Builder.app/Contents/Resources/app/server/upscaling/models');
    expect(resolved.binPath).toBe(
      '/Applications/Fab Builder.app/Contents/Resources/app/server/upscaling/bin/darwin-arm64/upscayl-bin'
    );
  });

  it('prefers an explicit binary override when configured', () => {
    const resolved = resolveUpscalingAssetPaths({
      runtimeDir: '/Applications/Fab Builder.app/Contents/Resources/app/bun',
      platform: 'darwin',
      arch: 'arm64',
      env: {
        FAB_BUILDER_UPSCAYL_BIN: '/custom/upscayl',
      },
    });

    expect(resolved.binPath).toBe('/custom/upscayl');
  });

  it('does not fall back to the legacy linux binary on macOS when the darwin binary is missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fab-builder-upscayl-path-test-'));
    createdDirs.push(dir);

    const assetPaths = {
      binPath: path.join(dir, 'bin', 'darwin-arm64', 'upscayl-bin'),
      platformBinPath: path.join(dir, 'bin', 'darwin-arm64', 'upscayl-bin'),
      legacyBinPath: path.join(dir, 'upscayl-bin'),
    };

    await fs.mkdir(path.dirname(assetPaths.legacyBinPath), { recursive: true });
    await fs.writeFile(assetPaths.legacyBinPath, 'linux-binary-placeholder');

    await expect(resolveAvailableUpscaylBin({ assetPaths, platform: 'darwin' })).rejects.toThrow(
      'Missing platform-specific upscayl binary for darwin'
    );
  });

  it('resolves cards json from the bundled dist directory in packaged desktop builds', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fab-builder-cards-test-'));
    createdDirs.push(dir);

    const runtimeDir = path.join(dir, 'app', 'server');
    const cwd = path.join(dir, 'app');
    const bundledCardsPath = path.join(cwd, 'dist', 'public', 'cards.json');

    await fs.mkdir(runtimeDir, { recursive: true });
    await fs.mkdir(path.dirname(bundledCardsPath), { recursive: true });
    await fs.writeFile(bundledCardsPath, '[]');

    const resolved = resolveCardsJsonPath({
      runtimeDir,
      cwd,
    });

    expect(resolved).toBe(bundledCardsPath);
  });

  it('writes fetch responses to disk without relying on a Node stream body', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fab-builder-proxy-test-'));
    createdDirs.push(dir);
    const outPath = path.join(dir, 'image.webp');
    const response = new Response(new Uint8Array([1, 2, 3, 4]), {
      headers: { 'content-type': 'image/webp' },
      status: 200,
    });

    await writeFetchResponseToFile(response, outPath);

    await expect(fs.readFile(outPath)).resolves.toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it('can be started programmatically for desktop embedding', async () => {
    const server = await startProxyServer({ port: 0, host: '127.0.0.1' });
    startedServers.push(server);

    const address = server.address();

    expect(address).toBeTruthy();
    expect(typeof address).toBe('object');
    expect(address.port).toBeGreaterThan(0);

    const statusCode = await new Promise((resolve, reject) => {
      const request = http.get(`http://127.0.0.1:${address.port}/__missing__`, (response) => {
        response.resume();
        resolve(response.statusCode);
      });

      request.on('error', reject);
    });

    expect(statusCode).toBe(404);
  });
});
