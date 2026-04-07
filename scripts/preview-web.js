import { startPreviewServers } from '../src/bun/preview.js';

const host = process.env.HOST || '127.0.0.1';
const rendererPort = Number(process.env.PORT || 4173);
const servers = await startPreviewServers({
  host,
  rendererPort,
});

console.log(`Previewing built app at ${servers.url}`);
