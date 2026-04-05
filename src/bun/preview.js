import { startProxyServer } from '../../server/proxy.js';
import { APP_BASE_PATH, startRendererServer } from './runtime.js';

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

export async function startPreviewServers({
  distDir,
  host = '127.0.0.1',
  rendererPort = 4173,
  proxyPort = 3001,
} = {}) {
  const rendererServer = startRendererServer({
    distDir,
    host,
    port: rendererPort,
  });
  const proxyServer = await startProxyServer({
    host,
    port: proxyPort,
  });

  return {
    rendererServer,
    rendererPort: rendererServer.port,
    proxyPort: typeof proxyServer.address() === 'object' ? proxyServer.address().port : proxyPort,
    proxyServer,
    url: `http://${host}:${rendererServer.port}${APP_BASE_PATH}`,
    async stop() {
      rendererServer.stop?.(true);
      await closeHttpServer(proxyServer);
    },
  };
}
