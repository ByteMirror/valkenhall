const DEFAULT_LOCAL_API_HOST = '127.0.0.1';
const LOCAL_API_PORT = 3001;

export function getLocalApiOrigin(locationLike = globalThis.location) {
  const hostname = locationLike?.hostname;
  const resolvedHost = hostname === 'localhost' ? 'localhost' : DEFAULT_LOCAL_API_HOST;
  return `http://${resolvedHost}:${LOCAL_API_PORT}`;
}

export const LOCAL_API_ORIGIN = getLocalApiOrigin({ hostname: DEFAULT_LOCAL_API_HOST });
