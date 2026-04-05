import { getReleaseArchiveFileName } from './release-targets.js';

const version = process.argv[2];
const targetId = process.argv[3];

if (!version || !targetId) {
  console.error('Usage: bun scripts/print-release-archive-name.js <version> <target-id>');
  process.exit(1);
}

console.log(getReleaseArchiveFileName({ version, targetId }));
