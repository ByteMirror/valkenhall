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
