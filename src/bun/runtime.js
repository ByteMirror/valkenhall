import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { readFile, writeFile, unlink, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const APP_BASE_PATH = '';
const DEFAULT_RENDERER_HOST = '127.0.0.1';
const runtimeDir = path.dirname(fileURLToPath(import.meta.url));

const PERSISTENT_DATA_DIR = path.resolve(
  process.env.VALKENHALL_DATA_DIR ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', 'dev.fabianurbanek.valkenhall', 'data')
      : process.platform === 'win32'
        ? path.join(
            process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
            'dev.fabianurbanek.valkenhall',
            'data',
          )
        : path.join(
            process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
            'dev.fabianurbanek.valkenhall',
            'data',
          )),
);
const PERSISTENT_IMAGES_DIR = path.join(PERSISTENT_DATA_DIR, 'sorcery-images');
const AUTH_TOKEN_PATH = path.join(PERSISTENT_DATA_DIR, 'auth-token.json');

const SORCERY_CDN_BASE = 'https://d27a44hjr9gen3.cloudfront.net/cards';

// Card images are immutable — once downloaded, they're permanent local assets.
// The `immutable` directive tells the browser to never revalidate.
const IMAGE_HEADERS = { 'Cache-Control': 'public, max-age=31536000, immutable' };

let assetDownloadState = { running: false, total: 0, downloaded: 0, failed: 0, done: false };
let windowApi = null;
let updateApi = null;

export function registerWindowApi(api) {
  windowApi = api;
}

export function registerUpdateApi(api) {
  updateApi = api;
}

export function getRendererUrl({ staticServerPort, host = DEFAULT_RENDERER_HOST } = {}) {
  if (process.env.ELECTROBUN_RENDERER_URL) {
    return process.env.ELECTROBUN_RENDERER_URL;
  }
  return `http://${host}:${staticServerPort}${APP_BASE_PATH}`;
}

export function resolveDistDirectory() {
  const candidates = [
    process.env.ELECTROBUN_DIST_DIR,
    path.resolve(process.cwd(), 'dist'),
    path.resolve(runtimeDir, '../dist'),
    path.resolve(runtimeDir, '../../dist'),
  ].filter(Boolean);

  const distDir = candidates.find((candidate) => existsSync(path.join(candidate, 'index.html')));
  if (!distDir) {
    throw new Error(
      `Unable to find a built renderer. Looked in: ${candidates.join(', ')}. Run "bun run build" first.`,
    );
  }
  return distDir;
}

export function startRendererServer({
  port = 0,
  host = DEFAULT_RENDERER_HOST,
  distDir = resolveDistDirectory(),
} = {}) {
  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(request) {
      const url = new URL(request.url);
      const pathname = url.pathname;

      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }

      try {
        if (pathname.startsWith('/sorcery-images/')) {
          return await handleSorceryImage(pathname, distDir);
        }

        if (pathname.startsWith('/game-assets/')) {
          return handleGameAsset(pathname, distDir);
        }

        if (pathname === '/api/sorcery/cards') {
          return handleSorceryCards(distDir);
        }

        if (pathname === '/api/auth/token') {
          return await handleAuthToken(request);
        }

        if (pathname === '/api/assets/status') {
          return handleAssetStatus();
        }
        if (pathname === '/api/assets/download') {
          return await handleAssetDownload(request);
        }

        if (pathname === '/api/display/mode') {
          return await handleDisplayMode(request);
        }

        if (pathname.startsWith('/api/update/')) {
          return await handleUpdate(request, pathname);
        }

        return serveStaticFile(distDir, pathname);
      } catch (err) {
        console.error(`[runtime] error handling ${pathname}:`, err);
        return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    },
  });

  return server;
}

function serveStaticFile(distDir, pathname) {
  const stripped =
    APP_BASE_PATH && pathname.startsWith(APP_BASE_PATH) ? pathname.slice(APP_BASE_PATH.length) : pathname;
  const relativePath = stripped.replace(/^\/+/, '') || 'index.html';
  const requestedFile = path.join(distDir, relativePath);

  if (existsSync(requestedFile) && !requestedFile.endsWith(path.sep)) {
    return new Response(Bun.file(requestedFile));
  }

  return new Response(Bun.file(path.join(distDir, 'index.html')));
}

async function handleSorceryImage(pathname, distDir) {
  const slug = pathname.slice('/sorcery-images/'.length);
  if (!/^[a-z0-9_-]+\.png$/i.test(slug)) {
    return new Response('Bad filename', { status: 400 });
  }

  const persistentPath = path.join(PERSISTENT_IMAGES_DIR, slug);
  if (existsSync(persistentPath)) {
    return new Response(Bun.file(persistentPath), { headers: IMAGE_HEADERS });
  }

  const bundledPath = path.join(distDir, 'sorcery-images', slug);
  if (existsSync(bundledPath)) {
    return new Response(Bun.file(bundledPath), { headers: IMAGE_HEADERS });
  }

  try {
    const cdnResponse = await fetch(`${SORCERY_CDN_BASE}/${slug}`, { redirect: 'follow' });
    if (!cdnResponse.ok) {
      return new Response('Not found', { status: 404 });
    }
    const buffer = Buffer.from(await cdnResponse.arrayBuffer());
    await mkdir(PERSISTENT_IMAGES_DIR, { recursive: true });
    await writeFile(persistentPath, buffer);
    return new Response(buffer, {
      headers: { 'Content-Type': 'image/png', ...IMAGE_HEADERS },
    });
  } catch {
    return new Response('CDN fetch failed', { status: 502 });
  }
}

function handleGameAsset(pathname, distDir) {
  const filename = pathname.slice('/game-assets/'.length);
  if (!/^[a-z0-9_-]+\.(webp|png|jpg|ogg|mp3|wav)$/i.test(filename)) {
    return new Response('Bad filename', { status: 400 });
  }
  const bundledPath = path.join(distDir, filename);
  if (existsSync(bundledPath)) {
    return new Response(Bun.file(bundledPath), { headers: IMAGE_HEADERS });
  }
  return new Response('Not found', { status: 404 });
}

function handleSorceryCards(distDir) {
  const cardsPath = path.join(distDir, 'sorcery-cards.json');
  if (existsSync(cardsPath)) {
    return new Response(Bun.file(cardsPath));
  }
  return Response.json({ error: 'Sorcery cards not bundled' }, { status: 404 });
}

async function handleAuthToken(request) {
  if (request.method === 'GET') {
    try {
      const raw = await readFile(AUTH_TOKEN_PATH, 'utf8');
      const { token } = JSON.parse(raw);
      return Response.json({ token });
    } catch (err) {
      if (err?.code === 'ENOENT') return Response.json({ token: null });
      return Response.json({ error: 'Failed to read token' }, { status: 500 });
    }
  }

  if (request.method === 'PUT') {
    try {
      const { token } = await request.json();
      if (!token) return Response.json({ error: 'Token required' }, { status: 400 });
      await mkdir(PERSISTENT_DATA_DIR, { recursive: true });
      await writeFile(AUTH_TOKEN_PATH, JSON.stringify({ token }), 'utf8');
      return Response.json({ success: true });
    } catch {
      return Response.json({ error: 'Failed to write token' }, { status: 500 });
    }
  }

  if (request.method === 'DELETE') {
    await unlink(AUTH_TOKEN_PATH).catch(() => {});
    return new Response(null, { status: 204 });
  }

  return new Response('Method not allowed', { status: 405 });
}

function handleAssetStatus() {
  // Count permanent card art files already saved to the user's data directory.
  let saved = 0;
  try {
    const files = readdirSync(PERSISTENT_IMAGES_DIR);
    saved = files.filter((f) => f.endsWith('.png')).length;
  } catch {}
  // Legacy field name `cached` kept for backwards compat with the client.
  return Response.json({ ...assetDownloadState, saved, cached: saved });
}

async function handleAssetDownload(request) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (assetDownloadState.running) {
    return Response.json({ status: 'already_running', ...assetDownloadState });
  }

  const body = await request.json();
  const { slugs } = body ?? {};
  if (!Array.isArray(slugs) || slugs.length === 0) {
    return Response.json({ error: 'No slugs provided' }, { status: 400 });
  }

  try {
    mkdirSync(PERSISTENT_IMAGES_DIR, { recursive: true });
  } catch {}

  const needed = slugs.filter((slug) => {
    const filePath = path.join(PERSISTENT_IMAGES_DIR, `${slug}.png`);
    return !existsSync(filePath);
  });

  if (needed.length === 0) {
    assetDownloadState = {
      running: false,
      total: slugs.length,
      downloaded: slugs.length,
      failed: 0,
      done: true,
    };
    return Response.json({ status: 'complete', ...assetDownloadState });
  }

  assetDownloadState = { running: true, total: needed.length, downloaded: 0, failed: 0, done: false };

  downloadBatch(needed).catch((err) => {
    console.error('[runtime] asset download failed:', err);
  });

  return Response.json({ status: 'started', total: needed.length });
}

async function downloadBatch(slugs) {
  const CONCURRENCY = 8;
  let index = 0;

  async function downloadNext() {
    while (index < slugs.length) {
      const i = index++;
      const slug = slugs[i];
      const cdnUrl = `${SORCERY_CDN_BASE}/${slug}.png`;
      const filePath = path.join(PERSISTENT_IMAGES_DIR, `${slug}.png`);
      try {
        const response = await fetch(cdnUrl, { redirect: 'follow' });
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          const tmpPath = `${filePath}.tmp`;
          await writeFile(tmpPath, buffer);
          await rename(tmpPath, filePath);
          assetDownloadState.downloaded++;
        } else {
          assetDownloadState.failed++;
        }
      } catch {
        assetDownloadState.failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => downloadNext()));
  assetDownloadState.running = false;
  assetDownloadState.done = true;
}

async function handleDisplayMode(request) {
  if (request.method === 'GET') {
    if (!windowApi) return Response.json({ mode: 'fullscreen' });
    return Response.json({ mode: windowApi.isFullScreen() ? 'fullscreen' : 'windowed' });
  }
  if (request.method === 'PUT') {
    const { mode } = await request.json();
    if (!windowApi) return Response.json({ error: 'Window API not available' }, { status: 503 });
    if (mode === 'fullscreen') windowApi.setFullScreen(true);
    else if (mode === 'windowed') windowApi.setFullScreen(false);
    else return Response.json({ error: 'Invalid mode' }, { status: 400 });
    return Response.json({ mode });
  }
  return new Response('Method not allowed', { status: 405 });
}

async function handleUpdate(request, pathname) {
  if (!updateApi) {
    return Response.json({
      state: 'UP_TO_DATE',
      currentVersion: null,
      newVersion: null,
      releaseNotes: null,
      downloadProgress: null,
      error: null,
    });
  }

  if (pathname === '/api/update/status' && request.method === 'GET') {
    return Response.json(updateApi.getStatus());
  }
  if (pathname === '/api/update/check' && request.method === 'POST') {
    const result = await updateApi.manualCheck();
    return Response.json(result || {});
  }
  if (pathname === '/api/update/retry' && request.method === 'POST') {
    const result = await updateApi.retryDownload();
    return Response.json(result || {});
  }
  if (pathname === '/api/update/apply' && request.method === 'POST') {
    setTimeout(() => updateApi.applyUpdate(), 500);
    return Response.json({ applying: true });
  }
  return new Response('Not found', { status: 404 });
}
