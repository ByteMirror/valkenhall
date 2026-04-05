import path from 'node:path';
import { spawn } from 'node:child_process';
import { getRuntimeReleaseTargetId } from './release-targets.js';

const targetId = getRuntimeReleaseTargetId();

if (!targetId) {
  console.log(`No bundled Upscayl runtime target for ${process.platform}-${process.arch}; skipping asset bootstrap.`);
  process.exit(0);
}

const prepareScriptPath = path.resolve('scripts/prepare-release-assets.js');

const child = spawn(process.execPath, [prepareScriptPath, targetId], {
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code ?? 1);
});
