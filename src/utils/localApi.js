const DEFAULT_LOCAL_API_HOST = '127.0.0.1';
const DEFAULT_LOCAL_API_PORT = 3001;

function resolveApiPort() {
  if (typeof window !== 'undefined' && window.location?.search) {
    const params = new URLSearchParams(window.location.search);
    const port = params.get('apiPort');
    if (port) return Number(port);
  }
  return DEFAULT_LOCAL_API_PORT;
}

const resolvedPort = resolveApiPort();

export function getLocalApiOrigin() {
  return `http://${DEFAULT_LOCAL_API_HOST}:${resolvedPort}`;
}

export const LOCAL_API_ORIGIN = getLocalApiOrigin();

/**
 * Resolve a card image URL to the local API origin.
 * Remote players send URLs with their port; this rebuilds with ours.
 */
export function resolveLocalImageUrl(url) {
  if (!url) return '';
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  return path.startsWith('/') ? `${getLocalApiOrigin()}${path}` : url;
}
