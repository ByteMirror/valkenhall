import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import {
  resolveCardsJsonPath,
  startProxyServer,
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
  it('resolves cards json from the bundled dist directory in packaged desktop builds', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fab-builder-cards-test-'));
    createdDirs.push(dir);

    const runtimeDir = path.join(dir, 'app', 'server');
    const cwd = path.join(dir, 'app');
    const bundledCardsPath = path.join(cwd, 'dist', 'cards.json');

    await fs.mkdir(runtimeDir, { recursive: true });
    await fs.mkdir(path.join(cwd, 'dist'), { recursive: true });
    await fs.writeFile(bundledCardsPath, '[]');

    const resolved = resolveCardsJsonPath({
      runtimeDir,
      cwd,
    });

    expect(resolved).toBe(bundledCardsPath);
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
