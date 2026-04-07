/**
 * Local proxy server for Valkenhall desktop client.
 *
 * After the backend migration, this server's responsibilities are intentionally
 * small — the remote Valkenhall server handles auth, decks, profiles, mail,
 * friends, auctions, matchmaking, and game sessions. This process only needs
 * to handle things that must live on the local machine:
 *
 *   - Serving cached Sorcery card images and game assets
 *   - Serving the bundled Sorcery card database JSON
 *   - First-run asset pre-download
 *   - Persisting the auth token across CEF port changes
 *   - Display mode (fullscreen/windowed) window control
 *   - Auto-update endpoints consumed by the renderer
 */

import express from 'express';
import cors from 'cors';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const PORT = 3001;
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PERSISTENT_DATA_DIR = path.resolve(
  process.env.VALKENHALL_DATA_DIR ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', 'dev.fabianurbanek.valkenhall', 'data')
      : process.platform === 'win32'
        ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'dev.fabianurbanek.valkenhall', 'data')
        : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'dev.fabianurbanek.valkenhall', 'data')),
);
const PERSISTENT_IMAGES_DIR = path.join(PERSISTENT_DATA_DIR, 'sorcery-images');

function resolvePublicFile(relativePath, { runtimeDir = __dirname, cwd = process.cwd() } = {}) {
  const candidates = [
    path.resolve(runtimeDir, '../public', relativePath),
    path.resolve(runtimeDir, '../dist', relativePath),
    path.resolve(runtimeDir, '../../dist', relativePath),
    path.resolve(cwd, 'public', relativePath),
    path.resolve(cwd, 'dist', relativePath),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

export function resolveCardsJsonPath(opts) {
  return resolvePublicFile('cards.json', opts);
}

export function resolveSorceryCardsJsonPath(opts) {
  return resolvePublicFile('sorcery-cards.json', opts);
}

const SORCERY_CARDS_JSON_PATH = resolveSorceryCardsJsonPath();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// --- Card database ---

app.get('/api/sorcery/cards', (_req, res) => {
  res.sendFile(SORCERY_CARDS_JSON_PATH, (error) => {
    if (!error) return;
    console.error('Failed to load Sorcery cards json:', error);
    res.status(error.statusCode || 500).json({
      error: 'Failed to load Sorcery cards',
      details: error.message,
    });
  });
});

// --- Game asset serving ---

const SORCERY_CDN_BASE = 'https://d27a44hjr9gen3.cloudfront.net/cards';

app.get('/game-assets/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!/^[a-z0-9_-]+\.(webp|png|jpg|ogg|mp3|wav)$/i.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const localPath = resolvePublicFile(filename);
  if (localPath) return res.sendFile(localPath);
  res.status(404).json({ error: 'Asset not found' });
});

app.get('/sorcery-images/:filename', async (req, res) => {
  const { filename } = req.params;
  if (!/^[a-z0-9_-]+\.png$/i.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const persistentPath = path.join(PERSISTENT_IMAGES_DIR, filename);
  if (existsSync(persistentPath)) {
    return res.sendFile(persistentPath);
  }

  const bundledPath = resolvePublicFile(`sorcery-images/${filename}`);
  if (existsSync(bundledPath)) {
    return res.sendFile(bundledPath);
  }

  const slug = filename.replace(/\.png$/i, '');
  const cdnUrl = `${SORCERY_CDN_BASE}/${slug}.png`;

  try {
    const cdnResponse = await fetch(cdnUrl, { redirect: 'follow' });
    if (!cdnResponse.ok) {
      return res.status(cdnResponse.status).json({ error: 'Image not found' });
    }
    const buffer = Buffer.from(await cdnResponse.arrayBuffer());
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (error) {
    res.status(502).json({ error: 'Failed to fetch image', details: error.message });
  }
});

// --- Asset pre-download (first-run) ---

let assetDownloadState = { running: false, total: 0, downloaded: 0, failed: 0, done: false };

app.get('/api/assets/status', (_req, res) => {
  let cached = 0;
  try {
    const files = readdirSync(PERSISTENT_IMAGES_DIR);
    cached = files.filter(f => f.endsWith('.png')).length;
  } catch {}
  res.json({ ...assetDownloadState, cached });
});

app.post('/api/assets/download', async (req, res) => {
  if (assetDownloadState.running) {
    return res.json({ status: 'already_running', ...assetDownloadState });
  }

  const { slugs } = req.body;
  if (!Array.isArray(slugs) || slugs.length === 0) {
    return res.status(400).json({ error: 'No slugs provided' });
  }

  try { mkdirSync(PERSISTENT_IMAGES_DIR, { recursive: true }); } catch {}

  const needed = slugs.filter(slug => {
    const filePath = path.join(PERSISTENT_IMAGES_DIR, `${slug}.png`);
    return !existsSync(filePath);
  });

  if (needed.length === 0) {
    assetDownloadState = { running: false, total: slugs.length, downloaded: slugs.length, failed: 0, done: true };
    return res.json({ status: 'complete', ...assetDownloadState });
  }

  assetDownloadState = { running: true, total: needed.length, downloaded: 0, failed: 0, done: false };
  res.json({ status: 'started', total: needed.length });

  const CONCURRENCY = 8;
  let index = 0;

  async function writeFileAtomic(filePath, data) {
    const tmpPath = `${filePath}.tmp`;
    await fs.writeFile(tmpPath, data);
    await fs.rename(tmpPath, filePath);
  }

  async function downloadNext() {
    while (index < needed.length) {
      const i = index++;
      const slug = needed[i];
      const cdnUrl = `${SORCERY_CDN_BASE}/${slug}.png`;
      const filePath = path.join(PERSISTENT_IMAGES_DIR, `${slug}.png`);
      try {
        const response = await fetch(cdnUrl, { redirect: 'follow' });
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          await writeFileAtomic(filePath, buffer);
          assetDownloadState.downloaded++;
        } else {
          assetDownloadState.failed++;
        }
      } catch {
        assetDownloadState.failed++;
      }
    }
  }

  Promise.all(Array.from({ length: CONCURRENCY }, () => downloadNext()))
    .then(() => {
      assetDownloadState.running = false;
      assetDownloadState.done = true;
    })
    .catch(() => {
      assetDownloadState.running = false;
      assetDownloadState.done = true;
    });
});

// --- Auth token persistence ---
//
// The auth token is persisted locally so the user stays signed in across CEF
// restarts, which change the port of the embedded proxy. The remote server is
// the source of truth — this is just a convenience store.

const AUTH_TOKEN_DIR = path.resolve(
  process.env.FAB_BUILDER_DATA_DIR ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', 'fab-builder')
      : process.platform === 'win32'
        ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'fab-builder')
        : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'fab-builder')),
);
const AUTH_TOKEN_PATH = path.join(AUTH_TOKEN_DIR, 'auth-token.json');

app.get('/api/auth/token', async (_req, res) => {
  try {
    const raw = await fs.readFile(AUTH_TOKEN_PATH, 'utf8');
    const { token } = JSON.parse(raw);
    res.json({ token });
  } catch (error) {
    if (error?.code === 'ENOENT') return res.json({ token: null });
    res.status(500).json({ error: 'Failed to read token' });
  }
});

app.put('/api/auth/token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });
    await fs.mkdir(AUTH_TOKEN_DIR, { recursive: true });
    await fs.writeFile(AUTH_TOKEN_PATH, JSON.stringify({ token }), 'utf8');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save token' });
  }
});

app.delete('/api/auth/token', async (_req, res) => {
  try {
    await fs.unlink(AUTH_TOKEN_PATH).catch(() => {});
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove token' });
  }
});

// --- Display mode (window control) ---

let windowApi = null;

export function registerWindowApi(api) {
  windowApi = api;
}

app.get('/api/display/mode', (_req, res) => {
  if (!windowApi) return res.json({ mode: 'fullscreen' });
  res.json({ mode: windowApi.isFullScreen() ? 'fullscreen' : 'windowed' });
});

app.put('/api/display/mode', (req, res) => {
  const { mode } = req.body;
  if (!windowApi) return res.status(503).json({ error: 'Window API not available' });
  if (mode === 'fullscreen') {
    windowApi.setFullScreen(true);
  } else if (mode === 'windowed') {
    windowApi.setFullScreen(false);
  } else {
    return res.status(400).json({ error: 'Invalid mode. Use "fullscreen" or "windowed".' });
  }
  res.json({ mode });
});

// --- Auto-update endpoints ---

let updateApi = null;

export function registerUpdateApi(api) {
  updateApi = api;
}

app.get('/api/update/status', (_req, res) => {
  if (!updateApi) {
    return res.json({
      state: 'UP_TO_DATE',
      currentVersion: null,
      newVersion: null,
      releaseNotes: null,
      downloadProgress: null,
      error: 'Updater not available',
    });
  }

  res.json(updateApi.getStatus());
});

app.post('/api/update/check', async (_req, res) => {
  if (!updateApi) {
    return res.status(503).json({ error: 'Updater not available' });
  }

  const status = await updateApi.manualCheck();
  res.json(status);
});

app.post('/api/update/retry', async (_req, res) => {
  if (!updateApi) {
    return res.status(503).json({ error: 'Updater not available' });
  }

  const status = await updateApi.retryDownload();
  res.json(status);
});

app.post('/api/update/apply', async (_req, res) => {
  if (!updateApi) {
    return res.status(503).json({ error: 'Updater not available' });
  }

  res.json({ applying: true });
  setTimeout(() => updateApi.applyUpdate(), 500);
});

// --- Bootstrap ---

export function createProxyApp() {
  return app;
}

export async function startProxyServer({ port = PORT, host } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      const resolvedHost =
        typeof address === 'object' && address?.address && address.address !== '::'
          ? address.address
          : host || 'localhost';
      const resolvedPort = typeof address === 'object' && address?.port ? address.port : port;

      console.log(`Valkenhall proxy server running on http://${resolvedHost}:${resolvedPort}`);
      resolve(server);
    });

    server.on('error', reject);
  });
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution) {
  startProxyServer().catch((error) => {
    console.error('Failed to start Valkenhall proxy server:', error);
    process.exitCode = 1;
  });
}
