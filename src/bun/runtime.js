import { existsSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs';
import { readFile, writeFile, unlink, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  convertPngBufferToWebp,
  CARD_IMAGE_EXT,
  CARD_IMAGE_CONTENT_TYPE,
} from './imageConverter.js';

// Performance log path. Fixed location so the dev tooling can tail it.
// JSON-lines format — one object per line, append-only, truncated only
// when /api/perf-log/reset is hit.
export const PERF_LOG_PATH = '/tmp/valkenhall-perf.log';

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
const PREFERENCES_PATH = path.join(PERSISTENT_DATA_DIR, 'preferences.json');

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

        if (pathname === '/api/preferences') {
          return await handlePreferences(request);
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

        if (pathname === '/api/perf-log') {
          return await handlePerfLog(request);
        }
        if (pathname === '/api/perf-log/reset') {
          return handlePerfLogReset();
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
  // Client requests `.webp` URLs (see src/utils/sorcery/normalizeCards.js).
  // The upstream Sorcery CDN only serves PNGs, so the server converts on
  // fetch and persists the WebP output. PNGs are never written to disk.
  const slug = pathname.slice('/sorcery-images/'.length);
  if (!/^[a-z0-9_-]+\.webp$/i.test(slug)) {
    return new Response('Bad filename', { status: 400 });
  }

  // Fast path: already in the user's persistent cache.
  const persistentPath = path.join(PERSISTENT_IMAGES_DIR, slug);
  if (existsSync(persistentPath)) {
    return new Response(Bun.file(persistentPath), {
      headers: { 'Content-Type': CARD_IMAGE_CONTENT_TYPE, ...IMAGE_HEADERS },
    });
  }

  // Bundled fallback: if the build happens to ship prepacked WebPs in
  // dist/sorcery-images, serve them directly. Production builds don't
  // currently bundle card art, but dev builds might.
  const bundledWebpPath = path.join(distDir, 'sorcery-images', slug);
  if (existsSync(bundledWebpPath)) {
    return new Response(Bun.file(bundledWebpPath), {
      headers: { 'Content-Type': CARD_IMAGE_CONTENT_TYPE, ...IMAGE_HEADERS },
    });
  }

  // CDN fetch + convert. The PNG buffer lives in memory only long
  // enough to run sharp; we never persist PNGs.
  const cdnSlug = slug.replace(/\.webp$/i, '.png');
  try {
    const cdnResponse = await fetch(`${SORCERY_CDN_BASE}/${cdnSlug}`, { redirect: 'follow' });
    if (!cdnResponse.ok) {
      return new Response('Not found', { status: 404 });
    }
    const pngBuffer = Buffer.from(await cdnResponse.arrayBuffer());
    const webpBuffer = await convertPngBufferToWebp(pngBuffer);
    await mkdir(PERSISTENT_IMAGES_DIR, { recursive: true });
    const tmpPath = `${persistentPath}.tmp`;
    await writeFile(tmpPath, webpBuffer);
    await rename(tmpPath, persistentPath);
    return new Response(webpBuffer, {
      headers: { 'Content-Type': CARD_IMAGE_CONTENT_TYPE, ...IMAGE_HEADERS },
    });
  } catch (err) {
    console.error(`[runtime] CDN fetch/convert failed for ${slug}:`, err);
    return new Response('CDN fetch failed', { status: 502 });
  }
}

// Append a JSON-line perf sample. Renderer POSTs an object; we tag it
// with a server-side timestamp and append. Synchronous append keeps
// ordering correct under bursty samples.
async function handlePerfLog(request) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  try {
    const body = await request.json();
    const line = JSON.stringify({ t: Date.now(), ...body }) + '\n';
    appendFileSync(PERF_LOG_PATH, line);
    return new Response('ok', { status: 204 });
  } catch (err) {
    return Response.json({ error: err?.message || 'perf log failed' }, { status: 500 });
  }
}

function handlePerfLogReset() {
  try {
    appendFileSync(PERF_LOG_PATH, '');
    Bun.write(PERF_LOG_PATH, '');
    return new Response('ok', { status: 204 });
  } catch (err) {
    return Response.json({ error: err?.message || 'reset failed' }, { status: 500 });
  }
}

// Cache header for SVG ornaments. SVGs are tiny but they get edited
// frequently during development; the immutable IMAGE_HEADERS that the
// rest of the assets use causes CEF to keep serving stale versions
// forever, with no easy way to bust the cache from the renderer side.
// no-cache + must-revalidate forces a conditional GET on every load,
// which is what we want for SVGs at the bandwidth they cost.
const SVG_HEADERS = {
  'Content-Type': 'image/svg+xml',
  'Cache-Control': 'no-cache, must-revalidate',
};

function handleGameAsset(pathname, distDir) {
  const filename = pathname.slice('/game-assets/'.length);
  // Allow flat filenames (existing assets) and a single subfolder for
  // structured asset groups like ornaments/. The path is restricted to
  // lowercase + hyphens to defeat traversal and arbitrary lookups.
  if (!/^([a-z0-9_-]+\/)?[a-z0-9_-]+\.(webp|png|jpg|ogg|mp3|wav|svg)$/i.test(filename)) {
    return new Response('Bad filename', { status: 400 });
  }
  const bundledPath = path.join(distDir, filename);
  if (existsSync(bundledPath)) {
    const headers = filename.endsWith('.svg') ? SVG_HEADERS : IMAGE_HEADERS;
    return new Response(Bun.file(bundledPath), { headers });
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

/**
 * Persistent key/value store for client-side preferences that need
 * to survive CEF instance restarts. localStorage is scoped to the
 * origin, and in dev the renderer URL changes per launch which
 * wipes localStorage. For things like "have I seen this tutorial
 * yet" we mirror the flag into a JSON file under the app's
 * persistent data dir so it survives the restart.
 *
 *   GET  /api/preferences        → returns the full object
 *   PUT  /api/preferences        → body: { key, value } to set one
 *   DELETE /api/preferences      → clears the entire store
 *   DELETE /api/preferences?prefix=x  → removes any key with that prefix
 */
async function handlePreferences(request) {
  async function readAll() {
    try {
      const raw = await readFile(PREFERENCES_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
      return {};
    } catch (err) {
      // Missing file is normal (first launch). Corrupt JSON (e.g. null
      // bytes from a truncated write) is treated the same — we start
      // fresh instead of locking every consumer into a permanent 500.
      return {};
    }
  }
  async function writeAll(data) {
    await mkdir(PERSISTENT_DATA_DIR, { recursive: true });
    // Atomic write: write to a temp file first, then rename over the
    // target. rename() is atomic on POSIX and near-atomic on Windows,
    // so a crash mid-write can't leave a half-written / null-filled
    // preferences file (which is exactly what corrupted it before).
    const tmp = PREFERENCES_PATH + '.tmp';
    await writeFile(tmp, JSON.stringify(data), 'utf8');
    await rename(tmp, PREFERENCES_PATH);
  }

  if (request.method === 'GET') {
    try {
      return Response.json(await readAll());
    } catch {
      return Response.json({ error: 'Failed to read preferences' }, { status: 500 });
    }
  }

  if (request.method === 'PUT') {
    try {
      const { key, value } = await request.json();
      if (typeof key !== 'string' || !key) {
        return Response.json({ error: 'key required' }, { status: 400 });
      }
      const data = await readAll();
      if (value === null || value === undefined) {
        delete data[key];
      } else {
        data[key] = value;
      }
      await writeAll(data);
      return Response.json({ success: true });
    } catch {
      return Response.json({ error: 'Failed to write preferences' }, { status: 500 });
    }
  }

  if (request.method === 'DELETE') {
    try {
      const url = new URL(request.url);
      const prefix = url.searchParams.get('prefix');
      if (prefix) {
        const data = await readAll();
        let removed = 0;
        for (const k of Object.keys(data)) {
          if (k.startsWith(prefix)) {
            delete data[k];
            removed++;
          }
        }
        await writeAll(data);
        return Response.json({ removed });
      }
      await unlink(PREFERENCES_PATH).catch(() => {});
      return new Response(null, { status: 204 });
    } catch {
      return Response.json({ error: 'Failed to delete preferences' }, { status: 500 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
}

function handleAssetStatus() {
  // Count cached WebP card art files in the user's persistent cache.
  let saved = 0;
  try {
    const files = readdirSync(PERSISTENT_IMAGES_DIR);
    saved = files.filter((f) => f.endsWith(CARD_IMAGE_EXT)).length;
  } catch {}
  // Legacy field name `cached` kept for backwards compat with the client.
  return Response.json({ ...assetDownloadState, saved, cached: saved });
}

// First-run and update-driven bulk card download.
//
// The client sends the full list of card slugs it expects to exist
// locally. The server filters out any that are already cached as
// .webp and only downloads+converts what's missing. This handles
// both the first-run case (download all) and the "new cards added
// in an update" case (download just the new ones) with the same
// code path — the client just re-sends the full slug list and the
// filter does the right thing.
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

  // A card counts as "cached" if the WebP file already exists in the
  // persistent cache. Missing cards get downloaded + converted.
  const needed = slugs.filter((slug) => {
    const webpPath = path.join(PERSISTENT_IMAGES_DIR, `${slug}${CARD_IMAGE_EXT}`);
    return !existsSync(webpPath);
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

// Download + convert worker pool. Each worker pulls a slug off the
// shared index, fetches the PNG from the CDN, runs it through sharp,
// and atomically writes the WebP to the persistent cache. Conversion
// happens inline inside the worker so WebP encoding for one card
// overlaps with the network fetch for the next — no separate "convert
// afterwards" phase, no intermediate PNG on disk.
//
// CONCURRENCY=8 is the same value the download-only version used.
// Sharp is CPU-bound per conversion but libvips releases the Node
// event loop while encoding, so 8-way concurrency keeps the network,
// CPU, and disk I/O all doing useful work in parallel.
async function downloadBatch(slugs) {
  const CONCURRENCY = 8;
  let index = 0;

  async function downloadNext() {
    while (index < slugs.length) {
      const i = index++;
      const slug = slugs[i];
      const cdnUrl = `${SORCERY_CDN_BASE}/${slug}.png`;
      const webpFilePath = path.join(PERSISTENT_IMAGES_DIR, `${slug}${CARD_IMAGE_EXT}`);
      try {
        const response = await fetch(cdnUrl, { redirect: 'follow' });
        if (!response.ok) {
          assetDownloadState.failed++;
          continue;
        }
        const pngBuffer = Buffer.from(await response.arrayBuffer());
        const webpBuffer = await convertPngBufferToWebp(pngBuffer);
        // Atomic write: .tmp first, rename to final path. If the
        // process dies mid-write, we either have the old file or
        // no file — never a truncated/corrupt .webp that would
        // cause mysterious rendering glitches later.
        const tmpPath = `${webpFilePath}.tmp`;
        await writeFile(tmpPath, webpBuffer);
        await rename(tmpPath, webpFilePath);
        assetDownloadState.downloaded++;
      } catch (err) {
        console.error(`[runtime] download+convert failed for ${slug}:`, err);
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
