import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_BASE_PATH = '';
const DEFAULT_RENDERER_HOST = '127.0.0.1';
const runtimeDir = path.dirname(fileURLToPath(import.meta.url));

export function getRendererUrl({ staticServerPort, host = DEFAULT_RENDERER_HOST }) {
  return process.env.ELECTROBUN_RENDERER_URL || `http://${host}:${staticServerPort}${APP_BASE_PATH}`;
}

export function resolveDistDirectory() {
  const candidates = [
    process.env.ELECTROBUN_DIST_DIR,
    path.resolve(process.cwd(), 'dist'),
    path.resolve(runtimeDir, '../../dist'),
  ].filter(Boolean);

  const distDir = candidates.find((candidate) => existsSync(path.join(candidate, 'index.html')));

  if (!distDir) {
    throw new Error(
      `Unable to find a built renderer. Looked in: ${candidates.join(', ')}. Run "bun run build" first.`
    );
  }

  return distDir;
}

function resolveRendererAssetPath(distDir, pathname) {
  const stripped = APP_BASE_PATH && pathname.startsWith(APP_BASE_PATH)
    ? pathname.slice(APP_BASE_PATH.length)
    : pathname;
  const relativePath = stripped.replace(/^\/+/, '') || 'index.html';
  const requestedFile = path.join(distDir, relativePath);

  if (existsSync(requestedFile) && !requestedFile.endsWith(path.sep)) {
    return { filePath: requestedFile };
  }

  return { filePath: path.join(distDir, 'index.html') };
}

export function startRendererServer({
  port = 0,
  host = DEFAULT_RENDERER_HOST,
  distDir = resolveDistDirectory(),
} = {}) {
  const server = Bun.serve({
    port,
    hostname: host,
    fetch(request) {
      const url = new URL(request.url);
      const resolved = resolveRendererAssetPath(distDir, url.pathname);

      if (!resolved) {
        return new Response('Not found', { status: 404 });
      }

      if (resolved.redirect) {
        return Response.redirect(`http://${host}:${server.port}${resolved.redirect}`, 302);
      }

      return new Response(Bun.file(resolved.filePath));
    },
  });

  return server;
}
