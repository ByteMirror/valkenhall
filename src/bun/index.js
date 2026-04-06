import { ApplicationMenu, BrowserWindow } from 'electrobun/bun';
import { startProxyServer, registerUpdateApi, registerWindowApi } from '../../server/proxy.js';
import { getDesktopHost, shouldStartEmbeddedProxy } from './devServerConfig.js';
import { registerDesktopCleanup } from './lifecycle.js';
import { buildApplicationMenu } from './menu.js';
import { getRendererUrl, startRendererServer } from './runtime.js';
import { initUpdater, getStatus, manualCheck, retryDownload, applyUpdate } from './updater.js';

const DESKTOP_HOST = getDesktopHost();
const IS_DEV = Boolean(process.env.ELECTROBUN_RENDERER_URL);
const DEFAULT_PROXY_PORT = IS_DEV ? Number(process.env.ELECTROBUN_PROXY_PORT || 3001) : 0;
const DEFAULT_STATIC_PORT = Number(process.env.ELECTROBUN_STATIC_PORT || 0);
const SHOULD_START_EMBEDDED_PROXY = shouldStartEmbeddedProxy();

let rendererServer = null;

if (!process.env.ELECTROBUN_RENDERER_URL) {
  rendererServer = startRendererServer({
    host: DESKTOP_HOST,
    port: DEFAULT_STATIC_PORT,
  });
}

const proxyServer = SHOULD_START_EMBEDDED_PROXY
  ? await startProxyServer({
      host: DESKTOP_HOST,
      port: DEFAULT_PROXY_PORT,
    })
  : null;

const proxyPort = proxyServer?.address?.()?.port || DEFAULT_PROXY_PORT;

registerUpdateApi({ getStatus, manualCheck, retryDownload, applyUpdate });
initUpdater().catch((err) => {
  console.error('Auto-updater initialization failed:', err);
});

const rendererUrl = getRendererUrl({
  host: DESKTOP_HOST,
  staticServerPort: rendererServer?.port,
  apiPort: proxyPort,
});

ApplicationMenu.setApplicationMenu(buildApplicationMenu());

const mainWindow = new BrowserWindow({
  title: 'Valkenhall',
  url: rendererUrl,
  renderer: 'cef',
  titleBarStyle: 'hiddenInset',
  frame: {
    width: 1520,
    height: 980,
    x: 120,
    y: 80,
  },
});

mainWindow.setFullScreen(true);

registerWindowApi({
  isFullScreen: () => mainWindow.isFullScreen(),
  setFullScreen: (fs) => mainWindow.setFullScreen(fs),
});

let isCleanedUp = false;

function cleanup() {
  if (isCleanedUp) {
    return;
  }

  isCleanedUp = true;
  rendererServer?.stop?.(true);
  proxyServer?.close?.();
}

registerDesktopCleanup(process, cleanup);

console.log(`Electrobun desktop shell started at ${rendererUrl}`);
console.log(`Proxy server on port ${proxyPort}`);

export { mainWindow };
