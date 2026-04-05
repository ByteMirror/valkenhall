import fs from 'node:fs/promises';
import tailwindPlugin from 'bun-plugin-tailwind';
import { APP_BASE_PATH } from '../src/bun/runtime.js';

const result = await Bun.build({
  entrypoints: ['./index.html'],
  outdir: './dist',
  target: 'browser',
  sourcemap: 'linked',
  minify: true,
  publicPath: `${APP_BASE_PATH}/`,
  plugins: [tailwindPlugin],
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

await fs.copyFile('./public/cards.json', './dist/cards.json');

console.log(`Built ${result.outputs.length} output files into dist/`);
