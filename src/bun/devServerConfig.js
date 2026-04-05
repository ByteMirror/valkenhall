const DESKTOP_LOOPBACK_HOST = '127.0.0.1';

export function getDesktopHost() {
  return DESKTOP_LOOPBACK_HOST;
}

export function shouldStartEmbeddedProxy(env = process.env) {
  return !env?.ELECTROBUN_RENDERER_URL;
}
