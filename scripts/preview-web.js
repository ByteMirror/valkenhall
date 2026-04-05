import { startPreviewServers } from '../src/bun/preview.js';

const host = process.env.HOST || '127.0.0.1';
const rendererPort = Number(process.env.PORT || 4173);
const proxyPort = Number(process.env.PROXY_PORT || 3001);
const servers = await startPreviewServers({
  host,
  rendererPort,
  proxyPort,
});

console.log(`Previewing built app at ${servers.url}`);
console.log(`Local proxy available at http://${host}:${servers.proxyPort}`);
