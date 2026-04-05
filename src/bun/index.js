import { ApplicationMenu, BrowserWindow } from 'electrobun/bun';
import { startProxyServer } from '../../server/proxy.js';
import { getDesktopHost, shouldStartEmbeddedProxy } from './devServerConfig.js';
import { registerDesktopCleanup } from './lifecycle.js';
import { buildApplicationMenu } from './menu.js';
import { getRendererUrl, startRendererServer } from './runtime.js';

const DESKTOP_HOST = getDesktopHost();
const DEFAULT_PROXY_PORT = Number(process.env.ELECTROBUN_PROXY_PORT || 3001);
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

const rendererUrl = getRendererUrl({
  host: DESKTOP_HOST,
  staticServerPort: rendererServer?.port,
});

ApplicationMenu.setApplicationMenu(buildApplicationMenu());

const mainWindow = new BrowserWindow({
  title: 'arsenal',
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

export { mainWindow };
