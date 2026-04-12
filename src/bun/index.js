import { ApplicationMenu, BrowserWindow } from 'electrobun/bun';
import { getDesktopHost } from './devServerConfig.js';
import { registerDesktopCleanup } from './lifecycle.js';
import { buildApplicationMenu } from './menu.js';
import {
  getRendererUrl,
  startRendererServer,
  registerWindowApi,
  registerUpdateApi,
} from './runtime.js';
import { initUpdater, getStatus, manualCheck, retryDownload, applyUpdate } from './updater.js';
import { ensureLinuxDesktopEntry } from './linuxDesktopEntry.js';

const DESKTOP_HOST = getDesktopHost();
const DEFAULT_STATIC_PORT = Number(process.env.ELECTROBUN_STATIC_PORT || 0);

registerUpdateApi({ getStatus, manualCheck, retryDownload, applyUpdate });

ensureLinuxDesktopEntry();

let rendererServer = null;
if (!process.env.ELECTROBUN_RENDERER_URL) {
  rendererServer = startRendererServer({
    host: DESKTOP_HOST,
    port: DEFAULT_STATIC_PORT,
  });
}

initUpdater().catch((err) => {
  console.error('Auto-updater initialization failed:', err);
});

const rendererUrl = getRendererUrl({
  host: DESKTOP_HOST,
  staticServerPort: rendererServer?.port,
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
  if (isCleanedUp) return;
  isCleanedUp = true;
  rendererServer?.stop?.(true);
}

registerDesktopCleanup(process, cleanup);

console.log(`Electrobun desktop shell started at ${rendererUrl}`);

export { mainWindow };
