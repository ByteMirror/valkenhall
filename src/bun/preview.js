import { APP_BASE_PATH, startRendererServer } from './runtime.js';

export async function startPreviewServers({
  distDir,
  host = '127.0.0.1',
  rendererPort = 4173,
} = {}) {
  const rendererServer = startRendererServer({
    distDir,
    host,
    port: rendererPort,
  });

  return {
    rendererServer,
    rendererPort: rendererServer.port,
    url: `http://${host}:${rendererServer.port}${APP_BASE_PATH}`,
    async stop() {
      rendererServer.stop?.(true);
    },
  };
}
