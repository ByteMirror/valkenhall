import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { getUpscaylBinaryRelativePath } from './release-targets.js';

const targetId = process.argv[2];

if (!targetId) {
  console.error('Usage: bun scripts/validate-release-assets.js <target-id>');
  process.exit(1);
}

const requiredFiles = [
  getUpscaylBinaryRelativePath(targetId),
  'server/upscaling/models/ultramix-balanced-4x.bin',
  'server/upscaling/models/ultramix-balanced-4x.param',
];

for (const relativePath of requiredFiles) {
  const absolutePath = path.resolve(relativePath);
  try {
    await fs.access(absolutePath, fsConstants.F_OK);
  } catch {
    console.error(`Missing required release asset for ${targetId}: ${relativePath}`);
    process.exit(1);
  }
}

if (!targetId.startsWith('win32-')) {
  const binaryPath = path.resolve(getUpscaylBinaryRelativePath(targetId));
  try {
    await fs.access(binaryPath, fsConstants.X_OK);
  } catch {
    console.error(`Upscaling binary is not executable for ${targetId}: ${path.relative(process.cwd(), binaryPath)}`);
    process.exit(1);
  }
}

console.log(`Release assets validated for ${targetId}`);
